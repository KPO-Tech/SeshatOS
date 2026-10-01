package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminConnectorsRequiresConnectedMode(t *testing.T) {
	fx := newSecurityTestFixture(t)
	// connectedServerURL is empty by default in this standalone-mode fixture.

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/connector-oauth-apps", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when not in connected mode, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminConnectorsRequiresAdminRole(t *testing.T) {
	fx := newSecurityTestFixture(t)
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("seshat-server should never be reached for a non-admin caller")
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/connector-oauth-apps", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for a non-admin caller, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminConnectorsListAndRegister(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotListAuth, gotRegisterAuth, gotRegisterPath string
	var gotRegisterBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/connectors/oauth-apps" && r.Method == http.MethodGet:
			gotListAuth = r.Header.Get("Authorization")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"oauth_apps": []map[string]any{{"kind": "github", "configured": true}},
				"count":      1,
			})
		case r.Method == http.MethodPut:
			gotRegisterAuth = r.Header.Get("Authorization")
			gotRegisterPath = r.URL.Path
			_ = json.NewDecoder(r.Body).Decode(&gotRegisterBody)
			_ = json.NewEncoder(w).Encode(map[string]any{"kind": "github", "client_id": gotRegisterBody["client_id"], "configured": true})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/connector-oauth-apps", nil)
	listReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	listResp := httptest.NewRecorder()
	fx.router.ServeHTTP(listResp, listReq)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected 200 listing oauth apps, got %d: %s", listResp.Code, listResp.Body.String())
	}
	if gotListAuth == "" || gotListAuth == "Bearer " {
		t.Fatal("expected the caller's session token to be forwarded as bearer auth")
	}

	registerBody, _ := json.Marshal(map[string]any{"client_id": "cid", "client_secret": "csecret"})
	registerReq := httptest.NewRequest(http.MethodPut, "/api/v1/admin/connector-oauth-apps/github", bytes.NewReader(registerBody))
	registerReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	registerReq.Header.Set("Content-Type", "application/json")
	registerResp := httptest.NewRecorder()
	fx.router.ServeHTTP(registerResp, registerReq)
	if registerResp.Code != http.StatusOK {
		t.Fatalf("expected 200 registering an oauth app, got %d: %s", registerResp.Code, registerResp.Body.String())
	}
	if gotRegisterAuth == "" {
		t.Fatal("expected the caller's session token to be forwarded on register")
	}
	if gotRegisterPath != "/api/v1/connectors/oauth-apps/github" {
		t.Fatalf("expected the kind to be forwarded in the path, got %q", gotRegisterPath)
	}
	if gotRegisterBody["organization_id"] == nil || gotRegisterBody["organization_id"] == "" {
		t.Fatalf("expected organization_id to be injected server-side, got %+v", gotRegisterBody)
	}
}
