package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestAdminAuditLogsUsesOrgTrailWhenConnectedAndAdmin proves the actual
// swap: once connected, an admin's existing /audit/logs call is answered
// from seshat-server's real organization audit trail instead of this
// device's local one - see docs/helps/... "Admin Console" architecture item.
func TestAdminAuditLogsUsesOrgTrailWhenConnectedAndAdmin(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotAuth, gotOrgID string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/audit-events" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotOrgID = r.URL.Query().Get("organization_id")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"audit_events": []map[string]any{
				{"id": "evt_1", "actor_user_id": "usr_1", "action": "membership.role_changed", "created_at": "2026-08-30T10:00:00Z"},
			},
		})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/audit/logs", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotAuth == "" || gotAuth == "Bearer " {
		t.Fatal("expected the caller's session token to be forwarded as bearer auth")
	}
	if gotOrgID == "" {
		t.Fatal("expected organization_id to be forwarded")
	}
	var result struct {
		Logs []struct {
			ID     string `json:"id"`
			Action string `json:"action"`
			Status string `json:"status"`
		} `json:"logs"`
		Count int `json:"count"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if result.Count != 1 || result.Logs[0].ID != "evt_1" || result.Logs[0].Action != "membership.role_changed" {
		t.Fatalf("expected the org event to come through on the existing logs field, got %+v", result)
	}
	if result.Logs[0].Status != "success" {
		t.Fatalf("expected a synthesized status of success, got %q", result.Logs[0].Status)
	}
}

// TestAdminAuditLogsStaysLocalForNonAdminEvenWhenConnected proves a
// connected non-admin's own view is entirely unaffected by this change -
// seshat-server is never even contacted for them (asserted below via the
// fake server's own t.Fatal). newSecurityTestFixture wires no
// AuditLogStore, so the local path this falls through to reports 503
// ("audit log store not configured") regardless of this change - that's
// this fixture's own pre-existing local-audit-unconfigured shape, not
// something this test is about.
func TestAdminAuditLogsStaysLocalForNonAdminEvenWhenConnected(t *testing.T) {
	fx := newSecurityTestFixture(t)
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("seshat-server should never be reached for a non-admin caller")
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/audit/logs", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code == http.StatusForbidden || resp.Code == http.StatusUnauthorized {
		t.Fatalf("expected the request to at least reach the local audit path (not be rejected outright), got %d: %s", resp.Code, resp.Body.String())
	}
}
