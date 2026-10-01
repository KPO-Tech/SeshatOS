package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAutomationJobsRequiresConnectedMode(t *testing.T) {
	fx := newSecurityTestFixture(t)
	// connectedServerURL is empty by default in this standalone-mode fixture.

	req := httptest.NewRequest(http.MethodGet, "/api/v1/automation/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when not in connected mode, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAutomationJobsListAndCreate(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotListAuth, gotCreateAuth string
	var gotCreateBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v1/jobs" && r.Method == http.MethodGet:
			gotListAuth = r.Header.Get("Authorization")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jobs":  []map[string]any{{"id": "job_1", "name": "Daily digest", "status": "active"}},
				"count": 1,
			})
		case r.URL.Path == "/api/v1/jobs" && r.Method == http.MethodPost:
			gotCreateAuth = r.Header.Get("Authorization")
			_ = json.NewDecoder(r.Body).Decode(&gotCreateBody)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "job_new", "name": gotCreateBody["name"], "status": "active"})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/automation/jobs", nil)
	listReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	listResp := httptest.NewRecorder()
	fx.router.ServeHTTP(listResp, listReq)
	if listResp.Code != http.StatusOK {
		t.Fatalf("expected 200 listing jobs, got %d: %s", listResp.Code, listResp.Body.String())
	}
	if gotListAuth == "" || gotListAuth == "Bearer " {
		t.Fatal("expected the caller's session token to be forwarded as bearer auth")
	}

	createBody, _ := json.Marshal(map[string]any{
		"name":             "Nightly report",
		"trigger_type":     "cron",
		"cron_expr":        "0 0 * * *",
		"execution_target": "cloud",
		"model_override":   "anthropic:claude-sonnet-5",
		"prompt":           "Summarize today's activity",
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/automation/jobs", bytes.NewReader(createBody))
	createReq.Header.Set("Authorization", "Bearer "+fx.adminToken)
	createReq.Header.Set("Content-Type", "application/json")
	createResp := httptest.NewRecorder()
	fx.router.ServeHTTP(createResp, createReq)
	if createResp.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating a job, got %d: %s", createResp.Code, createResp.Body.String())
	}
	if gotCreateAuth == "" {
		t.Fatal("expected the caller's session token to be forwarded on create")
	}
	if gotCreateBody["organization_id"] == nil || gotCreateBody["organization_id"] == "" {
		t.Fatalf("expected organization_id to be injected server-side, got %+v", gotCreateBody)
	}
}

func TestAutomationJobDispatchActions(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotPaths []string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPaths = append(gotPaths, r.Method+" "+r.URL.Path)
		switch {
		case r.Method == http.MethodDelete:
			w.WriteHeader(http.StatusNoContent)
		case r.URL.Path == "/api/v1/jobs/job_1/run":
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "run_1", "job_id": "job_1", "status": "queued"})
		case r.URL.Path == "/api/v1/jobs/job_1/runs":
			_ = json.NewEncoder(w).Encode(map[string]any{"runs": []map[string]any{{"id": "run_1", "job_id": "job_1", "status": "completed"}}, "count": 1})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "job_1", "name": "x", "status": "active"})
		}
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	cases := []struct {
		method string
		path   string
		want   int
	}{
		{http.MethodPost, "/api/v1/automation/jobs/job_1/pause", http.StatusOK},
		{http.MethodPost, "/api/v1/automation/jobs/job_1/resume", http.StatusOK},
		{http.MethodPost, "/api/v1/automation/jobs/job_1/run", http.StatusCreated},
		{http.MethodGet, "/api/v1/automation/jobs/job_1/runs", http.StatusOK},
		{http.MethodGet, "/api/v1/automation/jobs/job_1", http.StatusOK},
		{http.MethodDelete, "/api/v1/automation/jobs/job_1", http.StatusNoContent},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		req.Header.Set("Authorization", "Bearer "+fx.adminToken)
		resp := httptest.NewRecorder()
		fx.router.ServeHTTP(resp, req)
		if resp.Code != tc.want {
			t.Fatalf("%s %s: expected %d, got %d: %s", tc.method, tc.path, tc.want, resp.Code, resp.Body.String())
		}
	}

	wantUpstream := []string{
		"POST /api/v1/jobs/job_1/pause",
		"POST /api/v1/jobs/job_1/resume",
		"POST /api/v1/jobs/job_1/run",
		"GET /api/v1/jobs/job_1/runs",
		"GET /api/v1/jobs/job_1",
		"DELETE /api/v1/jobs/job_1",
	}
	if len(gotPaths) != len(wantUpstream) {
		t.Fatalf("expected %d upstream calls, got %d: %v", len(wantUpstream), len(gotPaths), gotPaths)
	}
	for i, want := range wantUpstream {
		if gotPaths[i] != want {
			t.Fatalf("upstream call %d: expected %q, got %q", i, want, gotPaths[i])
		}
	}
}

func TestAutomationJobsPropagatesForbidden(t *testing.T) {
	fx := newSecurityTestFixture(t)

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"organization access required"}`))
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	createBody, _ := json.Marshal(map[string]any{"name": "x", "trigger_type": "cron", "cron_expr": "* * * * *", "execution_target": "cloud", "model_override": "anthropic:claude-sonnet-5", "prompt": "p"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/automation/jobs", bytes.NewReader(createBody))
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusForbidden {
		t.Fatalf("expected the upstream 403 to propagate, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestAutomationDataflowNodeTypesList(t *testing.T) {
	fx := newSecurityTestFixture(t)

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/dataflow/node-types" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"node_types": []map[string]string{{"type": "agent", "name": "Agent", "category": "AI"}},
			"count":      1,
		})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/automation/dataflow/node-types", nil)
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
		t.Fatalf("expected 1 node type, got %d", body.Count)
	}
}

func TestAutomationDevicesList(t *testing.T) {
	fx := newSecurityTestFixture(t)

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/devices" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"devices": []map[string]any{{"id": "dev_1", "name": "Alice's laptop", "status": "active"}},
			"count":   1,
		})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/automation/devices", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
}
