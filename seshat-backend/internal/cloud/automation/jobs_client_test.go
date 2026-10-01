package cloudautomation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJobsClientListJobs(t *testing.T) {
	var gotAuth, gotQuery string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/jobs" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotQuery = r.URL.Query().Get("organization_id")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jobs":  []Job{{ID: "job_1", Name: "Daily digest", Status: "active"}},
			"count": 1,
		})
	}))
	defer fakeServer.Close()

	client := NewJobsClient(fakeServer.URL)
	jobs, err := client.ListJobs(context.Background(), "user-token", "org_1")
	if err != nil {
		t.Fatalf("list jobs: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if gotQuery != "org_1" {
		t.Fatalf("expected organization_id to be forwarded, got %q", gotQuery)
	}
	if len(jobs) != 1 || jobs[0].ID != "job_1" {
		t.Fatalf("unexpected jobs: %+v", jobs)
	}
}

func TestJobsClientListNodeTypes(t *testing.T) {
	var gotAuth, gotPath string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		_ = json.NewEncoder(w).Encode(map[string]any{
			"node_types": []map[string]string{
				{"type": "agent", "name": "Agent", "category": "AI"},
				{"type": "http_request", "name": "HTTP Request", "category": "Network"},
			},
			"count": 2,
		})
	}))
	defer fakeServer.Close()

	client := NewJobsClient(fakeServer.URL)
	nodeTypes, err := client.ListNodeTypes(context.Background(), "user-token")
	if err != nil {
		t.Fatalf("list node types: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if gotPath != "/api/v1/dataflow/node-types" {
		t.Fatalf("unexpected path: %q", gotPath)
	}
	if len(nodeTypes) != 2 || nodeTypes[0].Type != "agent" || nodeTypes[1].Type != "http_request" {
		t.Fatalf("unexpected node types: %+v", nodeTypes)
	}
}

func TestJobsClientCreateJobIncludesOrganizationID(t *testing.T) {
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/jobs" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(Job{ID: "job_new", Name: gotBody["name"].(string), Status: "active"})
	}))
	defer fakeServer.Close()

	client := NewJobsClient(fakeServer.URL)
	job, err := client.CreateJob(context.Background(), "tok", "org_1", JobParams{
		Name:            "Nightly report",
		TriggerType:     "cron",
		CronExpr:        "0 0 * * *",
		ExecutionTarget: "cloud",
		ModelOverride:   "anthropic:claude-sonnet-5",
		Prompt:          "Summarize today's activity",
	})
	if err != nil {
		t.Fatalf("create job: %v", err)
	}
	if job.ID != "job_new" {
		t.Fatalf("unexpected job: %+v", job)
	}
	if gotBody["organization_id"] != "org_1" {
		t.Fatalf("expected organization_id in the request body, got %+v", gotBody)
	}
	if gotBody["cron_expr"] != "0 0 * * *" {
		t.Fatalf("expected job params to be forwarded, got %+v", gotBody)
	}
}

func TestJobsClientSetJobPausedPicksCorrectAction(t *testing.T) {
	var gotPaths []string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPaths = append(gotPaths, r.URL.Path)
		_ = json.NewEncoder(w).Encode(Job{ID: "job_1", Status: "active"})
	}))
	defer fakeServer.Close()

	client := NewJobsClient(fakeServer.URL)
	if _, err := client.SetJobPaused(context.Background(), "tok", "job_1", true); err != nil {
		t.Fatalf("pause: %v", err)
	}
	if _, err := client.SetJobPaused(context.Background(), "tok", "job_1", false); err != nil {
		t.Fatalf("resume: %v", err)
	}
	if len(gotPaths) != 2 || gotPaths[0] != "/api/v1/jobs/job_1/pause" || gotPaths[1] != "/api/v1/jobs/job_1/resume" {
		t.Fatalf("unexpected request paths: %v", gotPaths)
	}
}

func TestJobsClientTriggerJobNow(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/jobs/job_1/run" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(Run{ID: "run_1", JobID: "job_1", Status: "queued"})
	}))
	defer fakeServer.Close()

	client := NewJobsClient(fakeServer.URL)
	run, err := client.TriggerJobNow(context.Background(), "tok", "job_1")
	if err != nil {
		t.Fatalf("trigger: %v", err)
	}
	if run.ID != "run_1" || run.Status != "queued" {
		t.Fatalf("unexpected run: %+v", run)
	}
}

func TestJobsClientDeleteJob(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/jobs/job_1" || r.Method != http.MethodDelete {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer fakeServer.Close()

	client := NewJobsClient(fakeServer.URL)
	if err := client.DeleteJob(context.Background(), "tok", "job_1"); err != nil {
		t.Fatalf("delete job: %v", err)
	}
}

func TestJobsClientListJobsPropagatesForbidden(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"organization access required"}`))
	}))
	defer fakeServer.Close()

	client := NewJobsClient(fakeServer.URL)
	if _, err := client.CreateJob(context.Background(), "tok", "org_1", JobParams{Name: "x"}); err == nil {
		t.Fatal("expected a forbidden error to propagate")
	}
}

func TestJobsClientListOrgDevices(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/devices" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"devices": []Device{{ID: "dev_1", Name: "Alice's laptop", Status: "active"}},
			"count":   1,
		})
	}))
	defer fakeServer.Close()

	client := NewJobsClient(fakeServer.URL)
	devices, err := client.ListOrgDevices(context.Background(), "tok", "org_1")
	if err != nil {
		t.Fatalf("list devices: %v", err)
	}
	if len(devices) != 1 || devices[0].ID != "dev_1" {
		t.Fatalf("unexpected devices: %+v", devices)
	}
}
