package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A stand-in for the router FreeLLMAPI, which the person runs on their computer.
func fakeFreeLLMAPIRouter(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer freellmapi-good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Query().Get("available") != "true" {
			// The whole catalogue, most of it without a key: SeshatOS must not ask for it.
			_, _ = w.Write([]byte(`{"data":[{"id":"nobody","available":false}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"mock-small","name":"Mock small","available":true},{"id":"auto","name":"Auto","available":true}]}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func freeLLMAPISetting(t *testing.T, router http.Handler, token, baseURL, key string) string {
	t.Helper()
	created := createProviderSettingViaAPI(t, router, token, map[string]any{
		"provider": "freellmapi", "name": "FreeLLMAPI", "auth_kind": "api_key", "api_key": key, "base_url": baseURL,
	})
	return created["id"].(string)
}

func TestFreeLLMAPIModelsAreReadFromTheRouterTheFirstTimeTheyAreListed(t *testing.T) {
	router := fakeFreeLLMAPIRouter(t)
	app, _ := newSettingsTestApp(t, nil)
	handler := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, handler, "admin@settings.test", "adminpass")
	settingID := freeLLMAPISetting(t, handler, token, router.URL+"/v1", "freellmapi-good")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+settingID+"/models", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list models: %d %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Models []struct {
			ModelID   string `json:"model_id"`
			IsDefault bool   `json:"is_default"`
		} `json:"models"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, m := range body.Models {
		ids = append(ids, m.ModelID)
	}
	// "auto" first and the default; none of the models of Anthropic that the runtime would answer for an unknown name.
	if strings.Join(ids, ",") != "auto,mock-small" || !body.Models[0].IsDefault {
		t.Fatalf("models = %v (%+v)", ids, body.Models)
	}
}

func TestFreeLLMAPISyncSaysWhyWhenTheRouterIsNotRunning(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	handler := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, handler, "admin@settings.test", "adminpass")
	settingID := freeLLMAPISetting(t, handler, token, "http://127.0.0.1:1/v1", "freellmapi-good")

	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers/"+settingID+"/models/sync", bytes.NewReader([]byte("{}")))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "is it running") {
		t.Fatalf("sync: %d %s", rec.Code, rec.Body.String())
	}
}

func TestFreeLLMAPIIsInTheProviderCatalogOfTheDesktop(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	handler := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, handler, "admin@settings.test", "adminpass")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/catalog", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	var body struct {
		Main []struct {
			ID      string `json:"id"`
			Name    string `json:"name"`
			BaseURL string `json:"base_url"`
		} `json:"main"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	for _, entry := range body.Main {
		if entry.ID == "freellmapi" {
			if entry.Name != "FreeLLMAPI" || !strings.HasPrefix(entry.BaseURL, "http://127.0.0.1:") {
				t.Fatalf("entry = %+v", entry)
			}
			return
		}
	}
	t.Fatal("FreeLLMAPI is not among the main providers")
}
