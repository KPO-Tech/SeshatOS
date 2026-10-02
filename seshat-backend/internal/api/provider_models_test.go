package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// TestModelsListReturnsTheLiveSDKCatalog is a regression test for the
// dynamic-catalog rewrite: this endpoint used to return a hand-rolled
// map keyed by provider name; it now mirrors seshat-server's
// GET /provider-catalog shape (an ordered array, same field names) so both
// frontends can share one mental model of the response.
func TestModelsListReturnsTheLiveSDKCatalog(t *testing.T) {
	fx := newSecurityTestFixture(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	rec := httptest.NewRecorder()
	fx.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected success, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Providers  []providerCatalogEntry `json:"providers"`
		Count      int                    `json:"count"`
		TotalCount int                    `json:"total_count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Count == 0 || len(body.Providers) != body.Count {
		t.Fatalf("expected a non-empty, consistent provider list, got %+v", body)
	}
	if body.TotalCount == 0 {
		t.Fatal("expected a non-zero total model count across all providers")
	}

	var anthropic *providerCatalogEntry
	for i := range body.Providers {
		if body.Providers[i].Name == "anthropic" {
			anthropic = &body.Providers[i]
			break
		}
	}
	if anthropic == nil {
		t.Fatalf("expected the SDK's anthropic provider to be present, got %+v", body.Providers)
	}
	if anthropic.AuthType != "api_key" || len(anthropic.Models) == 0 {
		t.Fatalf("unexpected anthropic entry: %+v", anthropic)
	}
}

func TestModelsListRejectsNonGET(t *testing.T) {
	fx := newSecurityTestFixture(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+fx.memberToken)
	rec := httptest.NewRecorder()
	fx.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

// TestModelsListRequiresAuthentication is a regression test for this route
// having been reachable with no Authorization header at all until this was
// found and fixed - every other non-public route in routes.go goes through
// app.authMiddleware; this one was a bare apiV1.HandleFunc, the one
// inconsistency in an otherwise consistent file.
func TestModelsListRequiresAuthentication(t *testing.T) {
	fx := newSecurityTestFixture(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/models", nil)
	rec := httptest.NewRecorder()
	fx.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with no Authorization header, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestDeletingProviderRemovesItsModels(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")

	body, _ := json.Marshal(map[string]string{"provider": "openai", "name": "My OpenAI", "base_url": "https://api.openai.com/v1", "model_id": "gpt-4o", "api_key": "sk-test-secret"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create provider: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(rec.Body).Decode(&created)

	ctx := context.Background()
	if _, err := app.modelStore.Create(ctx, db.CreateProviderModelParams{ProviderSettingID: created.ID, ModelID: "custom-model", DisplayName: "Custom"}); err != nil {
		t.Fatalf("create model: %v", err)
	}
	if models, _ := app.modelStore.ListBySettingID(ctx, created.ID); len(models) == 0 {
		t.Fatal("expected the model to exist before deleting the provider")
	}

	del := httptest.NewRequest(http.MethodDelete, "/api/v1/settings/providers/"+created.ID, nil)
	del.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, del)
	if rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
		t.Fatalf("delete provider: %d %s", rec.Code, rec.Body.String())
	}
	if models, _ := app.modelStore.ListBySettingID(ctx, created.ID); len(models) != 0 {
		t.Fatalf("expected the provider's models to be removed, got %d", len(models))
	}
}
