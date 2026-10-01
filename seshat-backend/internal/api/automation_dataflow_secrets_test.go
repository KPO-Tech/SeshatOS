package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAutomationDataflowSecretsList(t *testing.T) {
	fx := newSecurityTestFixture(t)

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/v1/dataflow-secrets") || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"dataflow_secrets": []map[string]string{{"id": "sec_1", "name": "prod-db"}},
			"count":            1,
		})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/automation/dataflow-secrets", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	var body struct {
		Count int `json:"count"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Count != 1 {
		t.Fatalf("expected 1 secret, got %d", body.Count)
	}
}

func TestAutomationDataflowSecretsCreate(t *testing.T) {
	fx := newSecurityTestFixture(t)

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/dataflow-secrets" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		var req map[string]string
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req["value"] == "" {
			t.Fatalf("expected value to be forwarded to seshat-server")
		}
		w.WriteHeader(http.StatusCreated)
		// The value is never echoed back - write-once, matching the real service.
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "sec_2", "name": req["name"]})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	body := strings.NewReader(`{"name":"prod-db","value":"postgres://..."}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/automation/dataflow-secrets", body)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", resp.Code, resp.Body.String())
	}
	var out struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Name != "prod-db" {
		t.Fatalf("expected name %q, got %q", "prod-db", out.Name)
	}
	if out.Value != "" {
		t.Fatalf("expected the secret value to never be returned, got %q", out.Value)
	}
}

func TestAutomationDataflowSecretsDelete(t *testing.T) {
	fx := newSecurityTestFixture(t)

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/dataflow-secrets/sec_1" || r.Method != http.MethodDelete {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/automation/dataflow-secrets/sec_1", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", resp.Code, resp.Body.String())
	}
}
