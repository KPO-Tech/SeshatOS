package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGitStateOutsideARepositoryAnswersRepoFalse(t *testing.T) {
	rec := httptest.NewRecorder()
	payload, _ := json.Marshal(map[string]string{"workspace_path": t.TempDir()})
	(&App{}).handleGitState(rec, httptest.NewRequest(http.MethodPost, "/git/state", strings.NewReader(string(payload))))
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != `{"repo":false}` {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGitStateOnlyAcceptsPost(t *testing.T) {
	rec := httptest.NewRecorder()
	(&App{}).handleGitState(rec, httptest.NewRequest(http.MethodGet, "/git/state", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status %d", rec.Code)
	}
}
