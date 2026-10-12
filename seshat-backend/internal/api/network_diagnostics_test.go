package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/netdiag"
)

func TestHandleNetworkDiagnosticsProbesTargetServerURL(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Fatalf("expected a probe against /health, got %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	a := &App{targetServerURL: target.URL}
	req := httptest.NewRequest(http.MethodGet, "/system/network-diagnostics", nil)
	rec := httptest.NewRecorder()
	a.handleNetworkDiagnostics(rec, req)

	var result netdiag.Result
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !result.OK {
		t.Fatalf("expected the diagnostic to succeed against a reachable target, got %+v", result)
	}
	if result.Target != target.URL {
		t.Fatalf("expected target %q, got %q", target.URL, result.Target)
	}
}

func TestHandleNetworkDiagnosticsReportsFailureAgainstUnreachableTarget(t *testing.T) {
	a := &App{targetServerURL: "http://this-host-does-not-exist.invalid"}
	req := httptest.NewRequest(http.MethodGet, "/system/network-diagnostics", nil)
	rec := httptest.NewRecorder()
	a.handleNetworkDiagnostics(rec, req)

	var result netdiag.Result
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if result.OK {
		t.Fatal("expected the diagnostic to fail against an unresolvable target")
	}
}

func TestHandleNetworkDiagnosticsWithoutTargetServerURL(t *testing.T) {
	a := &App{}
	req := httptest.NewRequest(http.MethodGet, "/system/network-diagnostics", nil)
	rec := httptest.NewRecorder()
	a.handleNetworkDiagnostics(rec, req)

	var result netdiag.Result
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(result.Steps) != 0 {
		t.Fatalf("expected no steps when no target is configured, got %+v", result.Steps)
	}
}
