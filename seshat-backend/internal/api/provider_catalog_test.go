package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type catalogResponse struct {
	Main      []providerCatalogEntryResponse `json:"main"`
	More      []providerCatalogEntryResponse `json:"more"`
	MainCount int                            `json:"main_count"`
	MoreCount int                            `json:"more_count"`
}

func getCatalog(t *testing.T, router http.Handler, token string) catalogResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/catalog", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("catalog: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var out catalogResponse
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestProviderCatalogListsTheMainProvidersThenTheCatalogOnes(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	out := getCatalog(t, router, token)
	if out.MainCount != len(out.Main) || out.MoreCount != len(out.More) {
		t.Fatalf("counts %d/%d do not match the lists %d/%d", out.MainCount, out.MoreCount, len(out.Main), len(out.More))
	}
	if len(out.Main) == 0 || len(out.Main) > 20 {
		t.Fatalf("the main list has %d providers, want the dozen built into the runtime", len(out.Main))
	}
	if len(out.More) < 100 {
		t.Fatalf("the catalog list has %d providers, want about 190", len(out.More))
	}

	mainIDs := map[string]bool{}
	for _, p := range out.Main {
		mainIDs[p.ID] = true
		if p.Name == "" || p.AuthType == "" {
			t.Errorf("incomplete main entry: %+v", p)
		}
	}
	for _, want := range []string{"anthropic", "openai", "codex", "ollama"} {
		if !mainIDs[want] {
			t.Errorf("main providers lack %s", want)
		}
	}
	prev := ""
	for _, p := range out.More {
		if mainIDs[p.ID] {
			t.Errorf("%s is listed in both lists", p.ID)
		}
		if p.BaseURL == "" || len(p.KeyEnvVars) == 0 || p.ModelCount == 0 {
			t.Errorf("incomplete catalog entry: %+v", p)
		}
		if name := strings.ToLower(p.Name); name < prev {
			t.Fatalf("%q comes after %q: the catalog list is not sorted without regard to case", p.Name, prev)
		} else {
			prev = name
		}
	}
}

func TestProviderCatalogNeedsASignedInUser(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/catalog", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", rec.Code)
	}
}

func TestProviderCatalogIsNotTakenForASettingID(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")
	// "catalog" must reach the catalog handler, not the per-setting one that would look for a setting with that id.
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers/catalog", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST on the catalog: got %d, want 405", rec.Code)
	}
}

func TestACatalogProviderSettingIsCreatedWithItsOwnModels(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	id := createProviderSettingForTest(t, router, token, "workers-ai", "Cloudflare")
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var setting map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&setting)
	if setting["provider"] != "cloudflare-workers-ai" {
		t.Fatalf("a former built-in name must be stored as the runtime's name, got %v", setting["provider"])
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/settings/providers/"+id+"/models", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	var models struct {
		Models []struct {
			ModelID string `json:"model_id"`
		} `json:"models"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&models)
	if len(models.Models) == 0 {
		t.Fatal("the setting has no models")
	}
	for _, m := range models.Models {
		if strings.HasPrefix(m.ModelID, "claude-") {
			t.Fatalf("a catalog provider was seeded with Anthropic's models: %s", m.ModelID)
		}
	}
}
