package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/preferences"
)

func newPreferencesTestApp(t *testing.T) *App {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "preferences-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewUserPreferencesStore(database)
	if err != nil {
		t.Fatalf("NewUserPreferencesStore: %v", err)
	}
	return &App{backend: &seshat.App{Preferences: preferences.NewService(preferences.NewLocalProvider(store))}}
}

func callPreferences(t *testing.T, app *App, method string, body map[string]any) userPreferencesResponse {
	t.Helper()
	var payload bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&payload).Encode(body)
	}
	req := withPrincipal(httptest.NewRequest(method, "/api/v1/users/me/preferences", &payload), "usr_rich")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	app.handleUserPreferences(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("%s: status %d: %s", method, rec.Code, rec.Body.String())
	}
	var out userPreferencesResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return out
}

func TestUserPreferencesRichAnswersAreOnByDefaultAndKeepTheChoice(t *testing.T) {
	app := newPreferencesTestApp(t)

	if !callPreferences(t, app, http.MethodGet, nil).RichAnswersEnabled {
		t.Fatal("a user who never chose must read rich_answers_enabled as true")
	}
	if callPreferences(t, app, http.MethodPut, map[string]any{"rich_answers_enabled": false}).RichAnswersEnabled {
		t.Fatal("the choice to turn them off must be saved")
	}
	if callPreferences(t, app, http.MethodPut, map[string]any{"preferred_name": "Ada"}).RichAnswersEnabled {
		t.Fatal("a save that omits the field must leave the stored choice alone")
	}
	if !callPreferences(t, app, http.MethodPut, map[string]any{"rich_answers_enabled": true}).RichAnswersEnabled {
		t.Fatal("the choice to turn them back on must be saved")
	}
}
