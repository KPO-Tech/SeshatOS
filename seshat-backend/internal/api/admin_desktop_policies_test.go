package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminDesktopPolicyCatalogRequiresConnectedModeAndAdmin(t *testing.T) {
	fx := newSecurityTestFixture(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/desktop-policies/catalog", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when not in connected mode, got %d: %s", resp.Code, resp.Body.String())
	}

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("seshat-server should never be reached for a non-admin caller")
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	memberReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/desktop-policies/catalog", nil)
	memberReq.Header.Set("Authorization", "Bearer "+fx.memberToken)
	memberResp := httptest.NewRecorder()
	fx.router.ServeHTTP(memberResp, memberReq)
	if memberResp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for a non-admin caller, got %d: %s", memberResp.Code, memberResp.Body.String())
	}
}

func TestAdminDesktopPolicyCatalogList(t *testing.T) {
	fx := newSecurityTestFixture(t)

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/desktop-policies/catalog" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"desktop_policies": []map[string]any{{"code": "allow_local_models", "default_value": true}},
		})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/desktop-policies/catalog", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200 listing catalog, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminDesktopPolicyBindingsListAndCreate(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotListAuth string
	var gotCreateBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/desktop-policy-bindings" && r.Method == http.MethodGet:
			gotListAuth = r.Header.Get("Authorization")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"desktop_policy_bindings": []map[string]any{{"id": "dpb_1", "policy_code": "allow_local_models"}},
				"count":                   1,
			})
		case r.URL.Path == "/api/v1/desktop-policy-bindings" && r.Method == http.MethodPost:
			_ = json.NewDecoder(r.Body).Decode(&gotCreateBody)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "dpb_new", "policy_code": gotCreateBody["policy_code"]})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/desktop-policy-bindings", nil)
	listReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	listResp := httptest.NewRecorder()
	fx.router.ServeHTTP(listResp, listReq)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected 200 listing bindings, got %d: %s", listResp.Code, listResp.Body.String())
	}
	if gotListAuth == "" || gotListAuth == "Bearer " {
		t.Fatal("expected the caller's session token to be forwarded as bearer auth")
	}

	createBody, _ := json.Marshal(map[string]any{
		"policy_code": "allow_local_models", "subject_type": "org", "value": false,
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/admin/desktop-policy-bindings", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	createReq.Header.Set("Content-Type", "application/json")
	createResp := httptest.NewRecorder()
	fx.router.ServeHTTP(createResp, createReq)
	if createResp.Code != http.StatusOK {
		t.Fatalf("expected 200 creating a binding, got %d: %s", createResp.Code, createResp.Body.String())
	}
	if gotCreateBody["organization_id"] == nil || gotCreateBody["organization_id"] == "" {
		t.Fatalf("expected organization_id to be injected server-side, got %+v", gotCreateBody)
	}
}

func TestAdminDesktopPolicyBindingDelete(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotPath string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.Method + " " + r.URL.Path
		w.WriteHeader(http.StatusNoContent)
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/desktop-policy-bindings/dpb_1", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusNoContent {
		t.Fatalf("expected 204 deleting, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotPath != "DELETE /api/v1/desktop-policy-bindings/dpb_1" {
		t.Fatalf("unexpected forwarded request: %s", gotPath)
	}
}
