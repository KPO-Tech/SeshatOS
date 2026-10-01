package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMyConnectorAccountsRequiresConnectedMode(t *testing.T) {
	fx := newSecurityTestFixture(t)
	// connectedServerURL is empty by default in this standalone-mode fixture.

	req := httptest.NewRequest(http.MethodGet, "/api/v1/connectors/my-accounts", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when not in connected mode, got %d: %s", resp.Code, resp.Body.String())
	}
}

// TestMyConnectorAccountsIsSelfServiceNotAdminOnly is the key behavioral
// difference from admin_connectors_test.go's TestAdminConnectorsRequiresAdminRole
// - Workspace → Connections is any org member connecting their own account,
// not an org-wide setting, so a non-admin caller must reach seshat-server,
// not get a 403.
func TestMyConnectorAccountsIsSelfServiceNotAdminOnly(t *testing.T) {
	fx := newSecurityTestFixture(t)
	reached := false
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		_ = json.NewEncoder(w).Encode(map[string]any{"connector_accounts": []any{}, "count": 0})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/connectors/my-accounts", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200 for a non-admin, self-service caller, got %d: %s", resp.Code, resp.Body.String())
	}
	if !reached {
		t.Fatal("expected seshat-server to be reached for a member's own connections list")
	}
}

func TestMyConnectorAccountsListAndDelete(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotListAuth, gotListOrgID, gotDeleteAuth, gotDeletePath string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/connectors/my-accounts" && r.Method == http.MethodGet:
			gotListAuth = r.Header.Get("Authorization")
			gotListOrgID = r.URL.Query().Get("organization_id")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"connector_accounts": []map[string]any{{"id": "acct-1", "kind": "stripe", "status": "connected"}},
				"count":              1,
			})
		case r.Method == http.MethodDelete:
			gotDeleteAuth = r.Header.Get("Authorization")
			gotDeletePath = r.URL.Path
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/connectors/my-accounts", nil)
	listReq.Header.Set("Authorization", "Bearer "+fx.memberToken)
	listResp := httptest.NewRecorder()
	fx.router.ServeHTTP(listResp, listReq)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected 200 listing my accounts, got %d: %s", listResp.Code, listResp.Body.String())
	}
	if gotListAuth == "" || gotListAuth == "Bearer " {
		t.Fatal("expected the caller's session token to be forwarded as bearer auth")
	}
	if gotListOrgID == "" {
		t.Fatal("expected organization_id to be injected server-side from the local session")
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/connectors/my-accounts/acct-1", nil)
	deleteReq.Header.Set("Authorization", "Bearer "+fx.memberToken)
	deleteResp := httptest.NewRecorder()
	fx.router.ServeHTTP(deleteResp, deleteReq)
	if deleteResp.Code != http.StatusNoContent {
		t.Fatalf("expected 204 deleting my account, got %d: %s", deleteResp.Code, deleteResp.Body.String())
	}
	if gotDeleteAuth == "" {
		t.Fatal("expected the caller's session token to be forwarded on delete")
	}
	if gotDeletePath != "/api/v1/connectors/my-accounts/acct-1" {
		t.Fatalf("expected the account id to be forwarded in the path, got %q", gotDeletePath)
	}
}

func TestConnectorOAuthStartIsAgentAction(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotPath string
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(map[string]any{"authorization_url": "https://example.com/authorize"})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	body, _ := json.Marshal(map[string]any{"display_name": "My Salesforce"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/connectors/salesforce/oauth/start", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200 starting oauth, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotPath != "/api/v1/connectors/salesforce/oauth/start" {
		t.Fatalf("expected the kind to be forwarded in the path, got %q", gotPath)
	}
	if gotBody["purpose"] != "agent_action" {
		t.Fatalf("expected purpose to always be agent_action for this self-service flow, got %+v", gotBody)
	}
	if gotBody["organization_id"] == nil || gotBody["organization_id"] == "" {
		t.Fatalf("expected organization_id to be injected server-side, got %+v", gotBody)
	}

	var out struct {
		AuthorizationURL string `json:"authorization_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.AuthorizationURL != "https://example.com/authorize" {
		t.Fatalf("expected the authorization url to be forwarded back, got %q", out.AuthorizationURL)
	}
}

func TestConnectorStaticAccountForwardsSecret(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotPath string
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "acct-2", "kind": "stripe", "status": "connected"})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	body, _ := json.Marshal(map[string]any{"secret": "sk_test_123", "display_name": "Stripe test"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/connectors/stripe/static-account", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating a static account, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotPath != "/api/v1/connectors/stripe/static-account" {
		t.Fatalf("expected the kind to be forwarded in the path, got %q", gotPath)
	}
	if gotBody["secret"] != "sk_test_123" {
		t.Fatalf("expected the secret to be forwarded, got %+v", gotBody)
	}
}
