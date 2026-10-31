package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/pulls"
)

func newPullsApp() *App {
	noCredential := func(context.Context) (string, string) { return "", pulls.CredentialNone }
	return &App{backend: &seshat.App{Pulls: pulls.NewService(noCredential)}}
}

func TestPullsTrackWithoutCredentialAsksToConnectGitHub(t *testing.T) {
	rec := httptest.NewRecorder()
	body := strings.NewReader(`{"workspace_path":"","urls":["https://github.com/o/r/pull/1"]}`)
	newPullsApp().handlePullsTrack(rec, httptest.NewRequest(http.MethodPost, "/pulls/track", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var result pulls.Result
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Credential != pulls.CredentialNone || len(result.Pulls) != 0 || result.Note == "" {
		t.Fatalf("got %+v", result)
	}
	if !strings.Contains(rec.Body.String(), `"pulls":[]`) {
		t.Fatalf("an empty list must be an array, not null: %s", rec.Body.String())
	}
}

func TestPullsTrackOnlyAcceptsPost(t *testing.T) {
	rec := httptest.NewRecorder()
	newPullsApp().handlePullsTrack(rec, httptest.NewRequest(http.MethodGet, "/pulls/track", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status %d", rec.Code)
	}
}
