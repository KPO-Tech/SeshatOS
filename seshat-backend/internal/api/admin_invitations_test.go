package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminInvitationsRequiresConnectedMode(t *testing.T) {
	fx := newSecurityTestFixture(t)
	// connectedServerURL is empty by default in this standalone-mode fixture.

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/invitations", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when not in connected mode, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminInvitationsRequiresAdminRole(t *testing.T) {
	fx := newSecurityTestFixture(t)
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("seshat-server should never be reached for a non-admin caller")
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/invitations", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for a non-admin caller, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminInvitationsListAndCreate(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotListAuth, gotCreateAuth, gotListQuery string
	var gotCreateBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/invitations" && r.Method == http.MethodGet:
			gotListAuth = r.Header.Get("Authorization")
			gotListQuery = r.URL.RawQuery
			_ = json.NewEncoder(w).Encode(map[string]any{
				"invitations": []map[string]any{{"id": "inv_1", "email": "a@example.com", "status": "pending"}},
				"count":       1,
			})
		case r.URL.Path == "/api/v1/invitations" && r.Method == http.MethodPost:
			gotCreateAuth = r.Header.Get("Authorization")
			_ = json.NewDecoder(r.Body).Decode(&gotCreateBody)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "inv_new", "email": gotCreateBody["email"], "token": "raw-token"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/invitations?status=pending", nil)
	listReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	listResp := httptest.NewRecorder()
	fx.router.ServeHTTP(listResp, listReq)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected 200 listing invitations, got %d: %s", listResp.Code, listResp.Body.String())
	}
	if gotListAuth == "" || gotListAuth == "Bearer " {
		t.Fatal("expected the caller's session token to be forwarded as bearer auth")
	}
	if !bytes.Contains([]byte(gotListQuery), []byte("status=pending")) {
		t.Fatalf("expected status filter to be forwarded to seshat-server, got query: %s", gotListQuery)
	}

	createBody, _ := json.Marshal(map[string]any{"email": "new@example.com", "role": "member", "expires_in_days": 14})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	createReq.Header.Set("Content-Type", "application/json")
	createResp := httptest.NewRecorder()
	fx.router.ServeHTTP(createResp, createReq)
	if createResp.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating an invitation, got %d: %s", createResp.Code, createResp.Body.String())
	}
	if gotCreateAuth == "" {
		t.Fatal("expected the caller's session token to be forwarded on create")
	}
	if gotCreateBody["organization_id"] == nil || gotCreateBody["organization_id"] == "" {
		t.Fatalf("expected organization_id to be injected server-side, got %+v", gotCreateBody)
	}
	if gotCreateBody["expires_in_days"] != float64(14) {
		t.Fatalf("expected expires_in_days to be forwarded, got %+v", gotCreateBody)
	}
}

func TestAdminInvitationRevoke(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotPath, gotMethod, gotAuth string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotMethod = r.Method
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "inv_1", "status": "revoked"})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/invitations/inv_1/revoke", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusNoContent {
		t.Fatalf("expected 204 revoking an invitation, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotMethod != http.MethodPost || gotPath != "/api/v1/invitations/inv_1/revoke" {
		t.Fatalf("unexpected forwarded request: %s %s", gotMethod, gotPath)
	}
	if gotAuth == "" {
		t.Fatal("expected the caller's session token to be forwarded")
	}
}
