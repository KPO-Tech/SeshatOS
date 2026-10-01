package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminWebSearchOrgPolicyRequiresConnectedMode(t *testing.T) {
	fx := newSecurityTestFixture(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/web-search-org-policy", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when not in connected mode, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminWebSearchOrgPolicyRequiresAdminRole(t *testing.T) {
	fx := newSecurityTestFixture(t)
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("seshat-server should never be reached for a non-admin caller")
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/web-search-org-policy", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for a non-admin caller, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminWebSearchOrgPolicyGetAndPut(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotPutBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/web-search-org-policy" && r.Method == http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]any{"allowed_domains": []string{}, "blocked_domains": []string{}})
		case r.URL.Path == "/api/v1/web-search-org-policy" && r.Method == http.MethodPut:
			_ = json.NewDecoder(r.Body).Decode(&gotPutBody)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"allowed_domains": gotPutBody["allowed_domains"], "blocked_domains": gotPutBody["blocked_domains"],
			})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/web-search-org-policy", nil)
	getReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	getResp := httptest.NewRecorder()
	fx.router.ServeHTTP(getResp, getReq)
	if getResp.Code != http.StatusOK {
		t.Fatalf("expected 200 getting policy, got %d: %s", getResp.Code, getResp.Body.String())
	}

	putBody, _ := json.Marshal(map[string]any{"allowed_domains": []string{"wikipedia.org"}, "blocked_domains": []string{}})
	putReq := httptest.NewRequest(http.MethodPut, "/api/v1/admin/web-search-org-policy", bytes.NewReader(putBody))
	putReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	putReq.Header.Set("Content-Type", "application/json")
	putResp := httptest.NewRecorder()
	fx.router.ServeHTTP(putResp, putReq)
	if putResp.Code != http.StatusOK {
		t.Fatalf("expected 200 updating policy, got %d: %s", putResp.Code, putResp.Body.String())
	}
	if gotPutBody["organization_id"] == nil || gotPutBody["organization_id"] == "" {
		t.Fatalf("expected organization_id to be injected server-side, got %+v", gotPutBody)
	}
	var result struct {
		AllowedDomains []string `json:"allowed_domains"`
	}
	if err := json.NewDecoder(putResp.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(result.AllowedDomains) != 1 || result.AllowedDomains[0] != "wikipedia.org" {
		t.Fatalf("unexpected result: %+v", result)
	}
}
