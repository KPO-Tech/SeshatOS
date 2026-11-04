package cloudidentity

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// fakeServer plays the parts of seshat-server a device sign-in touches. tokenAnswer decides what
// POST /auth/device/token says: an error code, or "" for an approved session.
type fakeServer struct {
	*httptest.Server
	mu          sync.Mutex
	tokenAnswer string
	gotName     string
	gotCode     string
}

func newFakeServer(t *testing.T) *fakeServer {
	t.Helper()
	fake := &fakeServer{}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/auth/device/code", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ClientName string `json:"client_name"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		fake.mu.Lock()
		fake.gotName = body.ClientName
		fake.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{
			"device_code": "dvc_secret", "user_code": "BCDF-GHJK", "verification_uri": "https://cloud.example/device",
			"verification_uri_complete": "https://cloud.example/device?user_code=BCDF-GHJK", "expires_in": 600, "interval": 5,
		})
	})
	mux.HandleFunc("POST /api/v1/auth/device/token", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			DeviceCode string `json:"device_code"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		fake.mu.Lock()
		answer := fake.tokenAnswer
		fake.gotCode = body.DeviceCode
		fake.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if answer != "" {
			status := http.StatusBadRequest
			switch answer {
			case "auth.device_access_denied":
				status = http.StatusForbidden
			case "auth.device_code_expired":
				status = http.StatusUnauthorized
			}
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"message": "x", "code": answer}})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"token": "session-token", "user": map[string]any{"id": "usr_1", "email": "member@example.com", "display_name": "Member"},
			"organizations": []any{}, "memberships": []map[string]any{{"id": "mem_1", "user_id": "usr_1", "organization_id": "org_1", "role": "admin"}},
		})
	})
	mux.HandleFunc("GET /api/v1/auth/me", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer session-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"user":        map[string]any{"id": "usr_1", "email": "member@example.com", "display_name": "Member"},
			"memberships": []map[string]any{{"id": "mem_1", "user_id": "usr_1", "organization_id": "org_1", "role": "admin"}},
			"session":     map[string]any{"id": "ses_1", "user_id": "usr_1", "expires_at": time.Now().Add(time.Hour).UTC().Format(time.RFC3339)},
		})
	})
	mux.HandleFunc("POST /api/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"mfa_required": true, "mfa_token": "mfa_abc", "user": map[string]any{"id": "usr_1"}})
	})
	fake.Server = httptest.NewServer(mux)
	t.Cleanup(fake.Close)
	return fake
}

func newTestProvider(t *testing.T, serverURL string) (*Provider, *Cache) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "device-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	cache := NewCache(database)
	return NewProvider(serverURL, cache, nil), cache
}

func TestStartDeviceLoginReturnsTheCodesAndNamesTheApplication(t *testing.T) {
	fake := newFakeServer(t)
	provider, _ := newTestProvider(t, fake.URL)

	login, err := provider.StartDeviceLogin(context.Background(), "Seshat Desktop on PC")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if login.DeviceCode != "dvc_secret" || login.UserCode != "BCDF-GHJK" || login.Interval != 5 || login.ExpiresIn != 600 {
		t.Fatalf("unexpected codes: %+v", login)
	}
	if login.VerificationURIComplete != "https://cloud.example/device?user_code=BCDF-GHJK" {
		t.Fatalf("unexpected link: %s", login.VerificationURIComplete)
	}
	if fake.gotName != "Seshat Desktop on PC" {
		t.Fatalf("the server must be told who is asking, got %q", fake.gotName)
	}
}

func TestPollDeviceLoginReportsWaitingRefusalAndExpiryAsAnswers(t *testing.T) {
	fake := newFakeServer(t)
	provider, _ := newTestProvider(t, fake.URL)

	cases := map[string]string{
		"auth.device_authorization_pending": auth.DevicePending,
		"auth.device_slow_down":             auth.DeviceSlowDown,
		"auth.device_access_denied":         auth.DeviceDenied,
		"auth.device_code_expired":          auth.DeviceExpired,
	}
	for code, want := range cases {
		fake.mu.Lock()
		fake.tokenAnswer = code
		fake.mu.Unlock()
		poll, err := provider.PollDeviceLogin(context.Background(), "dvc_secret")
		if err != nil {
			t.Fatalf("%s: a waiting or refused answer is not an error, got %v", code, err)
		}
		if poll.Status != want || poll.Login != nil {
			t.Fatalf("%s: want status %q without a session, got %+v", code, want, poll)
		}
	}
}

func TestPollDeviceLoginOpensTheSessionOnceApproved(t *testing.T) {
	fake := newFakeServer(t)
	provider, cache := newTestProvider(t, fake.URL)

	poll, err := provider.PollDeviceLogin(context.Background(), "dvc_secret")
	if err != nil {
		t.Fatalf("poll: %v", err)
	}
	if poll.Status != auth.DeviceApproved || poll.Login == nil || poll.Login.Token != "session-token" {
		t.Fatalf("expected an approved session, got %+v", poll)
	}
	if poll.Login.User.Email != "member@example.com" || len(poll.Login.Roles) == 0 || poll.Login.Roles[0] != "admin" {
		t.Fatalf("expected the user and role from the server, got %+v", poll.Login)
	}
	if poll.Login.ExpiresAt.IsZero() {
		t.Fatal("the expiry must come from the server, not be guessed")
	}
	if _, _, found, err := cache.Get(context.Background(), "session-token"); err != nil || !found {
		t.Fatalf("the principal must be cached like after a password login: found=%v err=%v", found, err)
	}
	if fake.gotCode != "dvc_secret" {
		t.Fatalf("the server must receive the device code, got %q", fake.gotCode)
	}
}

func TestPollDeviceLoginSurfacesARealFailure(t *testing.T) {
	unreachable := httptest.NewServer(http.NotFoundHandler())
	unreachable.Close()
	provider, _ := newTestProvider(t, unreachable.URL)
	if _, err := provider.PollDeviceLogin(context.Background(), "dvc_secret"); err == nil {
		t.Fatal("an unreachable server must be an error, not a waiting answer")
	}
}

func TestAPasswordLoginForAnAccountWithASecondFactorSaysToUseTheCode(t *testing.T) {
	fake := newFakeServer(t)
	provider, _ := newTestProvider(t, fake.URL)

	_, err := provider.Login(context.Background(), "member@example.com", "password")
	if err == nil || bkerr.KindOf(err) != bkerr.ErrorKindForbidden {
		t.Fatalf("expected a forbidden error that points to the sign-in code, got %v", err)
	}
}
