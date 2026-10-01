package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminAgentPresetsRequiresConnectedMode(t *testing.T) {
	fx := newSecurityTestFixture(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/agent-presets", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when not in connected mode, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminAgentPresetsRequiresAdminRole(t *testing.T) {
	fx := newSecurityTestFixture(t)
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("seshat-server should never be reached for a non-admin caller")
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/agent-presets", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for a non-admin caller, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAdminAgentPresetsListAndCreate(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotListAuth string
	var gotCreateBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/agent-presets" && r.Method == http.MethodGet:
			gotListAuth = r.Header.Get("Authorization")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"agent_presets": []map[string]any{{"id": "agentpreset_1", "slug": "data-scientist"}},
				"count":         1,
			})
		case r.URL.Path == "/api/v1/agent-presets" && r.Method == http.MethodPost:
			_ = json.NewDecoder(r.Body).Decode(&gotCreateBody)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "agentpreset_new", "slug": gotCreateBody["slug"]})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/agent-presets", nil)
	listReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	listResp := httptest.NewRecorder()
	fx.router.ServeHTTP(listResp, listReq)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected 200 listing presets, got %d: %s", listResp.Code, listResp.Body.String())
	}
	if gotListAuth == "" || gotListAuth == "Bearer " {
		t.Fatal("expected the caller's session token to be forwarded as bearer auth")
	}

	createBody, _ := json.Marshal(map[string]any{
		"slug": "data-scientist", "name": "Data Scientist", "system_prompt": "You analyze data.",
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/admin/agent-presets", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	createReq.Header.Set("Content-Type", "application/json")
	createResp := httptest.NewRecorder()
	fx.router.ServeHTTP(createResp, createReq)
	if createResp.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating a preset, got %d: %s", createResp.Code, createResp.Body.String())
	}
	if gotCreateBody["organization_id"] == nil || gotCreateBody["organization_id"] == "" {
		t.Fatalf("expected organization_id to be injected server-side, got %+v", gotCreateBody)
	}
}

func TestAdminAgentPresetDispatchActions(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotPaths []string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPaths = append(gotPaths, r.Method+" "+r.URL.Path)
		switch {
		case r.Method == http.MethodDelete:
			w.WriteHeader(http.StatusNoContent)
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "agentpreset_1", "slug": "data-scientist"})
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	updateBody, _ := json.Marshal(map[string]any{"name": "Senior Data Scientist"})
	updateReq := httptest.NewRequest(http.MethodPut, "/api/v1/admin/agent-presets/agentpreset_1", bytes.NewReader(updateBody))
	updateReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp := httptest.NewRecorder()
	fx.router.ServeHTTP(updateResp, updateReq)
	if updateResp.Code != http.StatusOK {
		t.Fatalf("expected 200 updating, got %d: %s", updateResp.Code, updateResp.Body.String())
	}

	deleteReq := httptest.NewRequest(http.MethodDelete, "/api/v1/admin/agent-presets/agentpreset_1", nil)
	deleteReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	deleteResp := httptest.NewRecorder()
	fx.router.ServeHTTP(deleteResp, deleteReq)
	if deleteResp.Code != http.StatusNoContent {
		t.Fatalf("expected 204 deleting, got %d: %s", deleteResp.Code, deleteResp.Body.String())
	}

	if len(gotPaths) != 2 ||
		gotPaths[0] != "PUT /api/v1/agent-presets/agentpreset_1" ||
		gotPaths[1] != "DELETE /api/v1/agent-presets/agentpreset_1" {
		t.Fatalf("unexpected request paths: %v", gotPaths)
	}
}
