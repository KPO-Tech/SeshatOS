package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	cloudidentity "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/identity"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat-runtime/pkg/monitoring"
)

// connectedAppWithFakeServer wires the cloud identity provider to a small stand-in for seshat-server whose
// token endpoint answers "pending" until approve is set, then returns a session.
func connectedAppWithFakeServer(t *testing.T) (router http.Handler, approve *atomic.Bool) {
	t.Helper()
	approve = &atomic.Bool{}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/auth/device/code", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"device_code": "dvc_secret", "user_code": "BCDF-GHJK", "verification_uri": "https://cloud.example/device",
			"verification_uri_complete": "https://cloud.example/device?user_code=BCDF-GHJK", "expires_in": 600, "interval": 5,
		})
	})
	mux.HandleFunc("POST /api/v1/auth/device/token", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if !approve.Load() {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "waiting", "code": "auth.device_authorization_pending"}})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"token": "session-token", "user": map[string]any{"id": "usr_1", "email": "member@example.com"}})
	})
	mux.HandleFunc("GET /api/v1/auth/me", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"user":        map[string]any{"id": "usr_1", "email": "member@example.com", "display_name": "Member"},
			"memberships": []map[string]any{{"id": "mem_1", "user_id": "usr_1", "organization_id": "org_1", "role": "member"}},
			"session":     map[string]any{"id": "ses_1", "user_id": "usr_1", "expires_at": time.Now().Add(time.Hour).UTC().Format(time.RFC3339)},
		})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "device-api.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	provider := cloudidentity.NewProvider(server.URL, cloudidentity.NewCache(database), store)
	app := &App{backend: seshat.NewApp(seshat.Dependencies{
		Identity: store, AuthProvider: provider, QueryRuntime: stubQueryRunner{}, Monitoring: monitoring.NewSystem(nil),
	})}
	return CreateRouter(APIConfig{}, app), approve
}

func postDevice(router http.Handler, path, body, remote string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.RemoteAddr = remote
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func TestDeviceSignInGoesFromCodeToSessionWhenConnected(t *testing.T) {
	t.Setenv(allowUnprovenLocalSessionEnv, "true")
	router, approve := connectedAppWithFakeServer(t)

	start := postDevice(router, "/api/v1/auth/device/start", `{"client_name":"Seshat Desktop"}`, "127.0.0.1:50000")
	if start.Code != http.StatusOK || !strings.Contains(start.Body.String(), "BCDF-GHJK") {
		t.Fatalf("start: %d %s", start.Code, start.Body.String())
	}

	waiting := postDevice(router, "/api/v1/auth/device/poll", `{"device_code":"dvc_secret"}`, "127.0.0.1:50000")
	if waiting.Code != http.StatusOK || !strings.Contains(waiting.Body.String(), `"status":"pending"`) || strings.Contains(waiting.Body.String(), "token") {
		t.Fatalf("expected a pending answer without a token: %d %s", waiting.Code, waiting.Body.String())
	}

	approve.Store(true)
	done := postDevice(router, "/api/v1/auth/device/poll", `{"device_code":"dvc_secret"}`, "127.0.0.1:50000")
	var body devicePollResponse
	if err := json.Unmarshal(done.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v: %s", err, done.Body.String())
	}
	if done.Code != http.StatusOK || body.Status != "approved" || body.Token != "session-token" || body.User == nil || body.User.Email != "member@example.com" {
		t.Fatalf("expected the approved session: %d %s", done.Code, done.Body.String())
	}
}

func TestDeviceSignInIsRefusedToAnythingButTheDesktop(t *testing.T) {
	router, _ := connectedAppWithFakeServer(t)

	// No proof and no development override: a web page that reached the port.
	if resp := postDevice(router, "/api/v1/auth/device/start", `{}`, "127.0.0.1:50000"); resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 without the desktop's proof, got %d: %s", resp.Code, resp.Body.String())
	}
	if resp := postDevice(router, "/api/v1/auth/device/poll", `{"device_code":"dvc_secret"}`, "127.0.0.1:50000"); resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on poll without the desktop's proof, got %d", resp.Code)
	}

	// Even with the override, a caller that is not on this machine is refused.
	t.Setenv(allowUnprovenLocalSessionEnv, "true")
	if resp := postDevice(router, "/api/v1/auth/device/start", `{}`, "203.0.113.9:50000"); resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 from a remote address, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestDeviceSignInDoesNotExistWhenTheInstallIsNotConnected(t *testing.T) {
	t.Setenv(allowUnprovenLocalSessionEnv, "true")
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "device-standalone.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	defer database.Close()
	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))

	resp := postDevice(router, "/api/v1/auth/device/start", `{}`, "127.0.0.1:50000")
	if resp.Code != http.StatusForbidden || !strings.Contains(resp.Body.String(), "connected to an organization") {
		t.Fatalf("expected a clear refusal in standalone mode: %d %s", resp.Code, resp.Body.String())
	}
}
