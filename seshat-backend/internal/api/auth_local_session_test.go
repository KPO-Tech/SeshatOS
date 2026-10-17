package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func TestHandleAuthLocalSession_LoopbackCallerGetsASession(t *testing.T) {
	t.Setenv(allowUnprovenLocalSessionEnv, "true")
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "local-session.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()
	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/local-session", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	var payload loginResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Token == "" {
		t.Error("expected a non-empty session token")
	}

	// A second call must mint a fresh session for the same underlying
	// implicit user, not fail or recreate it.
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/local-session", nil)
	req2.RemoteAddr = "127.0.0.1:54322"
	resp2 := httptest.NewRecorder()
	router.ServeHTTP(resp2, req2)
	if resp2.Code != http.StatusOK {
		t.Fatalf("expected 200 on second call, got %d: %s", resp2.Code, resp2.Body.String())
	}
	var payload2 loginResponse
	if err := json.Unmarshal(resp2.Body.Bytes(), &payload2); err != nil {
		t.Fatalf("decode second response: %v", err)
	}
	if payload2.User.ID != payload.User.ID {
		t.Fatalf("expected the same implicit user across calls, got %q then %q", payload.User.ID, payload2.User.ID)
	}
}

func TestHandleAuthLocalSession_RejectsNonLoopbackCaller(t *testing.T) {
	t.Setenv(allowUnprovenLocalSessionEnv, "true")
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "local-session-remote.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()
	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))

	for _, remoteAddr := range []string{"10.0.0.5:1234", "203.0.113.9:443"} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/local-session", nil)
		req.RemoteAddr = remoteAddr
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)
		if resp.Code != http.StatusForbidden {
			t.Errorf("remoteAddr %q: expected 403, got %d: %s", remoteAddr, resp.Code, resp.Body.String())
		}
	}
}

func TestHandleAuthLocalSession_RejectsWrongMethod(t *testing.T) {
	t.Setenv(allowUnprovenLocalSessionEnv, "true")
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "local-session-method.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	defer database.Close()
	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}

	router := CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/local-session", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for GET, got %d: %s", resp.Code, resp.Body.String())
	}
}

func newLocalSessionRouter(t *testing.T) http.Handler {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "local-session-proof.db")))
	if err != nil {
		t.Fatalf("db.Open failed: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}
	return CreateRouter(APIConfig{}, newTestAPIApp(store, stubQueryRunner{}))
}

func TestHandleAuthLocalSession_WithoutProofIsRefusedFromLoopback(t *testing.T) {
	t.Setenv(allowUnprovenLocalSessionEnv, "")
	router := newLocalSessionRouter(t)

	for _, proof := range []string{"", "not-hex", "00"} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/local-session", nil)
		req.RemoteAddr = "127.0.0.1:54321"
		if proof != "" {
			req.Header.Set(localSessionProofHeader, proof)
		}
		resp := httptest.NewRecorder()
		router.ServeHTTP(resp, req)
		if resp.Code != http.StatusForbidden {
			t.Errorf("proof %q: expected 403, got %d: %s", proof, resp.Code, resp.Body.String())
		}
	}
}

func TestHandleAuthLocalSession_WithDesktopProofGetsASession(t *testing.T) {
	t.Setenv(allowUnprovenLocalSessionEnv, "")
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	router := newLocalSessionRouter(t)

	secret, err := ensureDesktopBridgeSecret()
	if err != nil {
		t.Fatalf("ensureDesktopBridgeSecret failed: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/local-session", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set(localSessionProofHeader, desktopBridgeProof(secret, localSessionProofContext))
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200 with a valid proof, got %d: %s", resp.Code, resp.Body.String())
	}

	wrong := httptest.NewRequest(http.MethodPost, "/api/v1/auth/local-session", nil)
	wrong.RemoteAddr = "127.0.0.1:54322"
	wrong.Header.Set(localSessionProofHeader, desktopBridgeProof(secret, "another/context"))
	wrongResp := httptest.NewRecorder()
	router.ServeHTTP(wrongResp, wrong)
	if wrongResp.Code != http.StatusForbidden {
		t.Errorf("expected 403 for a proof of another context, got %d", wrongResp.Code)
	}
}
