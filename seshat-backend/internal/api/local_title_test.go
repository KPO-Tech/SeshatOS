package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func putLocalTitle(t *testing.T, router http.Handler, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/v1/settings/local-title", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	return resp
}

func TestHandleLocalTitleConfig(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	titleDB, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "local-title-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { titleDB.Close() })
	store, err := db.NewLocalTitleConfigStore(titleDB)
	if err != nil {
		t.Fatalf("NewLocalTitleConfigStore: %v", err)
	}
	app.localTitleStore = store

	if resp := putLocalTitle(t, router, token, `{"enabled":true,"base_url":"http://127.0.0.1:8123","model":"Qwen3-0.6B"}`); resp.Code != http.StatusBadRequest {
		t.Fatalf("reasoning model: expected 400, got %d: %s", resp.Code, resp.Body.String())
	}
	if resp := putLocalTitle(t, router, token, `{"enabled":true,"base_url":"not a url","model":"qwen2.5-0.5b-instruct"}`); resp.Code != http.StatusBadRequest {
		t.Fatalf("bad url: expected 400, got %d: %s", resp.Code, resp.Body.String())
	}
	if resp := putLocalTitle(t, router, token, `{"enabled":true,"base_url":"http://127.0.0.1:8123","model":"qwen2.5-0.5b-instruct"}`); resp.Code != http.StatusOK {
		t.Fatalf("valid config: expected 200, got %d: %s", resp.Code, resp.Body.String())
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/local-title", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	var got localTitleConfigResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !got.Enabled || got.Model != "qwen2.5-0.5b-instruct" || got.BaseURL != "http://127.0.0.1:8123" {
		t.Fatalf("unexpected config %+v", got)
	}

	// Disabling must not require a valid model: it is how the desktop shuts the feature off.
	if resp := putLocalTitle(t, router, token, `{"enabled":false}`); resp.Code != http.StatusOK {
		t.Fatalf("disable: expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
}
