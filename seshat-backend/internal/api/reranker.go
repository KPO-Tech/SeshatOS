package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/rag/reranker"
)

type rerankerConfigResponse struct {
	BaseURL      string `json:"base_url,omitempty"`
	Model        string `json:"model,omitempty"`
	HasAPIKey    bool   `json:"has_api_key"`
	Enabled      bool   `json:"enabled"`
	IsConfigured bool   `json:"is_configured"`
	UpdatedAt    int64  `json:"updated_at,omitempty"`
}

func rerankerConfigToResponse(cfg *db.RerankerConfig) rerankerConfigResponse {
	if cfg == nil {
		return rerankerConfigResponse{Enabled: false}
	}
	var updatedAt int64
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		updatedAt = cfg.UpdatedAt.Unix()
	}
	return rerankerConfigResponse{
		BaseURL:      cfg.BaseURL,
		Model:        cfg.Model,
		HasAPIKey:    cfg.HasAPIKey,
		Enabled:      cfg.Enabled,
		IsConfigured: cfg.Enabled && strings.TrimSpace(cfg.BaseURL) != "",
		UpdatedAt:    updatedAt,
	}
}

// GET  /api/v1/settings/reranker
// PUT  /api/v1/settings/reranker
// POST /api/v1/settings/reranker/test
func (a *App) handleRerankerConfig(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}

	store := a.rerankerStore
	if store == nil {
		writeBackendError(w, bkerr.Unavailable("reranker config store not available", nil))
		return
	}

	tail := strings.TrimRight(r.URL.Path, "/")
	if strings.HasSuffix(tail, "/test") || strings.HasSuffix(tail, "/detect-model") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if strings.HasSuffix(tail, "/test") {
			a.handleRerankerTest(w, r, store)
		} else {
			a.handleRerankerDetectModel(w, r, store)
		}
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := store.Get(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to get reranker config", err))
			return
		}
		writeJSON(w, http.StatusOK, rerankerConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			BaseURL string  `json:"base_url"`
			APIKey  *string `json:"api_key"`
			Model   string  `json:"model"`
			Enabled bool    `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		cfg, err := store.Upsert(r.Context(), db.UpsertRerankerConfigParams{
			BaseURL: body.BaseURL,
			APIKey:  body.APIKey,
			Model:   body.Model,
			Enabled: body.Enabled,
		})
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to save reranker config: "+err.Error(), err))
			return
		}
		a.applyRerankerConfig(r.Context(), cfg, store)
		writeJSON(w, http.StatusOK, rerankerConfigToResponse(cfg))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) applyRerankerConfig(ctx context.Context, cfg *db.RerankerConfig, store *db.RerankerConfigStore) {
	if a.ragService == nil {
		return
	}
	if cfg == nil || !cfg.Enabled || strings.TrimSpace(cfg.BaseURL) == "" {
		a.ragService.SetReranker(nil)
		return
	}
	apiKey, _ := store.GetDecryptedAPIKey(ctx)
	a.ragService.SetReranker(reranker.New(reranker.Config{
		BaseURL: strings.TrimSpace(cfg.BaseURL),
		APIKey:  apiKey,
		Model:   strings.TrimSpace(cfg.Model),
		Timeout: 15 * time.Second,
	}))
}

// handleRerankerDetectModel probes a TEI instance's /info endpoint and
// returns the model_id it reports - the Reranker card's equivalent of the
// Embedding card's Ollama/TEI "Detect" button, since TEI (unlike a hosted
// Cohere/LangSearch endpoint) always serves exactly one model and can
// describe itself rather than requiring the user to know/copy its id by
// hand. POST /api/v1/settings/reranker/detect-model
func (a *App) handleRerankerDetectModel(w http.ResponseWriter, r *http.Request, store *db.RerankerConfigStore) {
	var body struct {
		BaseURL string `json:"base_url"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	baseURL := strings.TrimSpace(body.BaseURL)
	if baseURL == "" {
		if cfg, err := store.Get(r.Context()); err == nil && cfg != nil {
			baseURL = cfg.BaseURL
		}
	}

	modelID, err := detectTEIModel(r.Context(), baseURL)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"error": err.Error(), "model": ""})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"error": nil, "model": modelID})
}

func (a *App) handleRerankerTest(w http.ResponseWriter, r *http.Request, store *db.RerankerConfigStore) {
	var body struct {
		BaseURL string `json:"base_url"`
		APIKey  string `json:"api_key"`
		Model   string `json:"model"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	baseURL := strings.TrimSpace(body.BaseURL)
	model := strings.TrimSpace(body.Model)
	apiKey := strings.TrimSpace(body.APIKey)
	if baseURL == "" || model == "" {
		if cfg, err := store.Get(r.Context()); err == nil && cfg != nil {
			if baseURL == "" {
				baseURL = cfg.BaseURL
			}
			if model == "" {
				model = cfg.Model
			}
		}
	}
	if apiKey == "" && baseURL != "" {
		if key, err := store.GetDecryptedAPIKey(r.Context()); err == nil {
			apiKey = key
		}
	}
	if baseURL == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": 0,
			"error":      "base_url is required",
		})
		return
	}

	client := reranker.New(reranker.Config{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		Model:   model,
		Timeout: 10 * time.Second,
	})
	start := time.Now()
	_, _, err := client.Rerank(r.Context(), "investment risk", []string{
		"Lower fees can improve long-term portfolio returns.",
		"Dessert recipes usually depend on precise oven temperature.",
	}, 1)
	latency := time.Since(start).Milliseconds()

	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": latency,
			"error":      err.Error(),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"latency_ms": latency,
		"error":      nil,
	})
}
