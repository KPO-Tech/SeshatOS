package api

import (
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

type rerankerModelResponse struct {
	ID        string `json:"id"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	HasAPIKey bool   `json:"has_api_key"`
	// Active is true for the model the search uses now.
	Active bool `json:"active"`
}

func rerankerModelToResponse(model db.RerankerModel, current *db.RerankerConfig) rerankerModelResponse {
	active := current != nil && current.Enabled && current.BaseURL == model.BaseURL && current.Model == model.Model
	return rerankerModelResponse{ID: model.ID, BaseURL: model.BaseURL, Model: model.Model, HasAPIKey: model.HasAPIKey, Active: active}
}

// handleRerankerModels serves the list of rerank models the person has set up:
//
//	GET    /api/v1/settings/reranker/models            the list
//	POST   /api/v1/settings/reranker/models            set a model up (and use it when "use" is true)
//	DELETE /api/v1/settings/reranker/models/{id}       forget a model
//	POST   /api/v1/settings/reranker/models/{id}/use   make it the one the search uses
func (a *App) handleRerankerModels(w http.ResponseWriter, r *http.Request, store *db.RerankerConfigStore) {
	principal, _ := authPrincipalFromContext(r.Context())
	rest := strings.Trim(strings.SplitN(strings.TrimRight(r.URL.Path, "/"), "/settings/reranker/models", 2)[1], "/")
	ctx := r.Context()

	list := func() {
		models, err := store.ListModels(ctx)
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to list rerank models", err))
			return
		}
		current, _ := store.Get(ctx)
		out := make([]rerankerModelResponse, 0, len(models))
		for _, model := range models {
			out = append(out, rerankerModelToResponse(model, current))
		}
		writeJSON(w, http.StatusOK, map[string]any{"models": out})
	}

	switch {
	case rest == "" && r.Method == http.MethodGet:
		list()

	case rest == "" && r.Method == http.MethodPost:
		var body struct {
			BaseURL           string  `json:"base_url"`
			Model             string  `json:"model"`
			APIKey            *string `json:"api_key"`
			ProviderSettingID string  `json:"provider_setting_id"`
			Use               bool    `json:"use"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if body.ProviderSettingID != "" && (body.APIKey == nil || *body.APIKey == "") {
			key, err := a.providerKeyFor(ctx, principal, body.ProviderSettingID)
			if err != nil {
				writeBackendError(w, err)
				return
			}
			body.APIKey = &key
		}
		added, err := store.AddModel(ctx, body.BaseURL, body.Model, body.APIKey)
		if err != nil {
			writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
			return
		}
		if body.Use {
			cfg, err := store.UseModel(ctx, added.ID)
			if err != nil || cfg == nil {
				writeBackendError(w, bkerr.Internal("failed to use the rerank model", err))
				return
			}
			a.applyRerankerConfig(ctx, cfg, store)
		}
		list()

	case rest != "" && !strings.Contains(rest, "/") && r.Method == http.MethodDelete:
		current, _ := store.Get(ctx)
		models, _ := store.ListModels(ctx)
		for _, model := range models {
			// The model in use is the configuration itself: forgetting it empties the configuration and turns reranking off.
			if model.ID == rest && current != nil && current.Enabled && current.BaseURL == model.BaseURL && current.Model == model.Model {
				key := ""
				if cfg, err := store.Upsert(ctx, db.UpsertRerankerConfigParams{APIKey: &key, Enabled: false}); err == nil {
					a.applyRerankerConfig(ctx, cfg, store)
				}
			}
		}
		if _, err := store.RemoveModel(ctx, rest); err != nil {
			writeBackendError(w, bkerr.Internal("failed to remove the rerank model", err))
			return
		}
		list()

	case strings.HasSuffix(rest, "/use") && r.Method == http.MethodPost:
		cfg, err := store.UseModel(ctx, strings.TrimSuffix(rest, "/use"))
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to use the rerank model", err))
			return
		}
		if cfg == nil {
			writeBackendError(w, bkerr.NotFound("that rerank model was not found", nil))
			return
		}
		a.applyRerankerConfig(ctx, cfg, store)
		list()

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
