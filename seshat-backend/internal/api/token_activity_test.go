package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func tokenActivityTestApp(t *testing.T) *App {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "activity.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewTokenActivityStore(database)
	if err != nil {
		t.Fatalf("NewTokenActivityStore: %v", err)
	}
	return &App{tokenActivityStore: store}
}

func TestTokenActivityAnswersWithTodayAndAnEmptyList(t *testing.T) {
	app := tokenActivityTestApp(t)
	req := withPrincipal(httptest.NewRequest(http.MethodGet, "/api/v1/account/token-activity", nil), "u1")
	rec := httptest.NewRecorder()
	app.handleTokenActivity(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("%d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp["today"] != time.Now().Format(time.DateOnly) {
		t.Fatalf("today %v", resp["today"])
	}
	// A list and not null: the card reads it without checking.
	if days, ok := resp["days"].([]any); !ok || len(days) != 0 {
		t.Fatalf("days %v", resp["days"])
	}
}

func TestTokenActivityRefusesAnonymousAndOtherMethods(t *testing.T) {
	app := tokenActivityTestApp(t)
	rec := httptest.NewRecorder()
	app.handleTokenActivity(rec, httptest.NewRequest(http.MethodGet, "/api/v1/account/token-activity", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	app.handleTokenActivity(rec, withPrincipal(httptest.NewRequest(http.MethodPost, "/api/v1/account/token-activity", nil), "u1"))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("post: %d", rec.Code)
	}
}
