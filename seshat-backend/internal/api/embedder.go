package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	cloudknowledge "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/knowledge"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	ragembedder "github.com/KPO-Tech/seshat/pkg/rag/embedder"
)

type embedderConfigResponse struct {
	Provider     string `json:"provider"`
	BaseURL      string `json:"base_url,omitempty"`
	Model        string `json:"model,omitempty"`
	HasAPIKey    bool   `json:"has_api_key"`
	Enabled      bool   `json:"enabled"`
	IsConfigured bool   `json:"is_configured"`
	UpdatedAt    int64  `json:"updated_at,omitempty"`
}

func embedderConfigToResponse(cfg *db.EmbedderConfig) embedderConfigResponse {
	if cfg == nil {
		return embedderConfigResponse{Provider: "openai", Enabled: true}
	}
	isConfigured := cfg.BaseURL != "" && cfg.Model != ""
	var updatedAt int64
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		updatedAt = cfg.UpdatedAt.Unix()
	}
	return embedderConfigResponse{
		Provider:     cfg.Provider,
		BaseURL:      cfg.BaseURL,
		Model:        cfg.Model,
		HasAPIKey:    cfg.HasAPIKey,
		Enabled:      cfg.Enabled,
		IsConfigured: isConfigured,
		UpdatedAt:    updatedAt,
	}
}

// GET  /api/v1/settings/embedder
// PUT  /api/v1/settings/embedder
// POST /api/v1/settings/embedder/test
func (a *App) handleEmbedderConfig(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}

	tail := strings.TrimRight(r.URL.Path, "/")

	// POST .../test and .../detect-models are stateless probes against an
	// explicit or DB-defaulted provider/base_url/model - always local, even
	// when connected (see handleEmbedderConfigConnected's doc comment for
	// why plain GET/PUT below don't share this store).
	if strings.HasSuffix(tail, "/test") || strings.HasSuffix(tail, "/detect-models") {
		store := a.embedderStore
		if store == nil {
			writeBackendError(w, bkerr.Unavailable("embedder config store not available", nil))
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if strings.HasSuffix(tail, "/test") {
			a.handleEmbedderTest(w, r, store)
		} else {
			a.handleEmbedderDetectModels(w, r, store)
		}
		return
	}

	// Once connected to an organization server, the embedder card edits the
	// organization's real singleton setting (seshat-server's
	// knowledge.EmbedderSetting, the same one seshat-console's
	// EmbedderSettingsPage.tsx edits) instead of this device's own local
	// row - exactly like /corpora already does via internal/knowledge.Backend's
	// swap in bootstrap.go. This used to always stay local even when
	// connected, silently duplicating the org's real setting instead of
	// reading/writing it - see docs/helps/... "Admin Console" architecture item.
	if a.connectedServerURL != "" {
		a.handleEmbedderConfigConnected(w, r, principal)
		return
	}

	store := a.embedderStore
	if store == nil {
		writeBackendError(w, bkerr.Unavailable("embedder config store not available", nil))
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := store.Get(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to get embedder config", err))
			return
		}
		writeJSON(w, http.StatusOK, embedderConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			Provider string  `json:"provider"`
			BaseURL  string  `json:"base_url"`
			APIKey   *string `json:"api_key"`
			Model    string  `json:"model"`
			Enabled  bool    `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		cfg, err := store.Upsert(r.Context(), db.UpsertEmbedderConfigParams{
			Provider: body.Provider,
			BaseURL:  body.BaseURL,
			APIKey:   body.APIKey,
			Model:    body.Model,
			Enabled:  body.Enabled,
		})
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to save embedder config: "+err.Error(), err))
			return
		}
		writeJSON(w, http.StatusOK, embedderConfigToResponse(cfg))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleEmbedderConfigConnected serves GET/PUT /api/v1/settings/embedder
// against seshat-server's org-wide embedder setting once connected. /test
// and /detect-models stay on the local store above - they're stateless
// probes, and the caller (KnowledgeView.tsx) already sends explicit
// provider/base_url/model values from its loaded form state rather than
// relying on a server-side fallback.
func (a *App) handleEmbedderConfigConnected(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal) {
	organizationID := principal.OrganizationID()
	if organizationID == "" {
		writeJSONError(w, http.StatusBadRequest, "no organization for this account")
		return
	}
	client := cloudknowledge.NewClient(a.connectedServerURL)
	token := principal.AuthSession.ID

	switch r.Method {
	case http.MethodGet:
		setting, err := client.GetOrgEmbedderSetting(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, orgEmbedderSettingToResponse(setting))

	case http.MethodPut:
		var body struct {
			Provider string `json:"provider"`
			BaseURL  string `json:"base_url"`
			APIKey   string `json:"api_key"`
			Model    string `json:"model"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		setting, err := client.SetOrgEmbedderSetting(r.Context(), token, cloudknowledge.SetOrgEmbedderSettingParams{
			OrganizationID: organizationID,
			Provider:       body.Provider,
			Model:          body.Model,
			BaseURL:        body.BaseURL,
			APIKey:         body.APIKey,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, orgEmbedderSettingToResponse(setting))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// orgEmbedderSettingToResponse adapts seshat-server's singleton setting
// shape onto the same wire contract this endpoint already used locally, so
// KnowledgeView.tsx needs no changes. The org setting has no has_api_key or
// enabled concept of its own (it's just used once configured) - Enabled
// defaults true, and HasAPIKey stays false since seshat-server never
// echoes back whether a key is stored (only whether it's a request that
// clears/replaces one) - this only affects the "leave blank to keep
// current key" hint's accuracy, not the actual save semantics (an empty
// api_key on PUT already means "keep existing" on seshat-server's side).
func orgEmbedderSettingToResponse(s *cloudknowledge.OrgEmbedderSetting) embedderConfigResponse {
	if s == nil {
		return embedderConfigResponse{Provider: "openai", Enabled: true}
	}
	return embedderConfigResponse{
		Provider:     s.Provider,
		BaseURL:      s.BaseURL,
		Model:        s.Model,
		Enabled:      true,
		IsConfigured: s.BaseURL != "" && s.Model != "",
	}
}

func (a *App) handleEmbedderTest(w http.ResponseWriter, r *http.Request, store *db.EmbedderConfigStore) {
	// Accept an optional body to test a not-yet-saved config
	var body struct {
		Provider string `json:"provider"`
		BaseURL  string `json:"base_url"`
		APIKey   string `json:"api_key"`
		Model    string `json:"model"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	provider := strings.TrimSpace(body.Provider)
	baseURL := strings.TrimSpace(body.BaseURL)
	model := strings.TrimSpace(body.Model)
	apiKey := strings.TrimSpace(body.APIKey)

	// Fill from DB if fields not provided in request
	if baseURL == "" || model == "" {
		if cfg, err := store.Get(r.Context()); err == nil && cfg != nil {
			if baseURL == "" {
				baseURL = cfg.BaseURL
			}
			if model == "" {
				model = cfg.Model
			}
			if provider == "" {
				provider = cfg.Provider
			}
		}
	}
	if apiKey == "" && baseURL != "" {
		if key, err := store.GetDecryptedAPIKey(r.Context()); err == nil {
			apiKey = key
		}
	}

	if baseURL == "" || model == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": 0,
			"error":      "base_url and model are required",
		})
		return
	}

	cfg := &ragembedder.Config{
		Provider: ragembedder.Provider(strings.ToLower(provider)),
		BaseURL:  strings.TrimRight(baseURL, "/"),
		APIKey:   apiKey,
		Model:    model,
		Timeout:  10 * time.Second,
	}
	if cfg.Provider == "" {
		cfg.Provider = ragembedder.Provider(ragembedder.DetectProviderPublic(baseURL))
	}

	emb := ragembedder.New(cfg)
	start := time.Now()
	_, err := emb.EmbedTexts(r.Context(), []string{"test"})
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

// handleEmbedderDetectModels probes the Ollama instance (or static list for OpenAI)
// and returns models classified as embedding vs LLM.
// POST /api/v1/settings/embedder/detect-models
func (a *App) handleEmbedderDetectModels(w http.ResponseWriter, r *http.Request, store *db.EmbedderConfigStore) {
	var body struct {
		Provider string `json:"provider"`
		BaseURL  string `json:"base_url"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	provider := strings.TrimSpace(body.Provider)
	baseURL := strings.TrimRight(strings.TrimSpace(body.BaseURL), "/")

	if baseURL == "" {
		if cfg, err := store.Get(r.Context()); err == nil && cfg != nil {
			baseURL = strings.TrimRight(cfg.BaseURL, "/")
			if provider == "" {
				provider = cfg.Provider
			}
		}
	}

	if provider == "" {
		provider = string(ragembedder.DetectProviderPublic(baseURL))
	}

	if strings.ToLower(provider) == "tei" {
		modelID, err := detectTEIModel(r.Context(), baseURL)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{
				"error":            err.Error(),
				"embedding_models": []string{},
				"llm_models":       []string{},
			})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"embedding_models": []string{modelID},
			"llm_models":       []string{},
		})
		return
	}

	if strings.ToLower(provider) != "ollama" {
		// OpenAI-compatible: return static well-known embedding models
		writeJSON(w, http.StatusOK, map[string]any{
			"embedding_models": []string{
				"text-embedding-3-small",
				"text-embedding-3-large",
				"text-embedding-ada-002",
			},
			"llm_models": []string{},
		})
		return
	}

	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}

	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, baseURL+"/api/tags", nil)
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput("invalid base_url", err))
		return
	}
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"error":            err.Error(),
			"embedding_models": []string{},
			"llm_models":       []string{},
		})
		return
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		writeBackendError(w, bkerr.Internal("failed to read ollama response", err))
		return
	}

	var result struct {
		Models []struct {
			Name    string `json:"name"`
			Details struct {
				Families []string `json:"families"`
				Family   string   `json:"family"`
			} `json:"details"`
		} `json:"models"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		writeBackendError(w, bkerr.Internal("failed to parse ollama response", err))
		return
	}

	var embeddingModels []string
	var llmModels []string

	for _, m := range result.Models {
		if isEmbeddingModel(m.Name, m.Details.Families, m.Details.Family) {
			embeddingModels = append(embeddingModels, m.Name)
		} else {
			llmModels = append(llmModels, m.Name)
		}
	}

	if embeddingModels == nil {
		embeddingModels = []string{}
	}
	if llmModels == nil {
		llmModels = []string{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"embedding_models": embeddingModels,
		"llm_models":       llmModels,
	})
}

var embeddingNamePatterns = []string{
	"embed", "minilm", "mxbai", "snowflake", "arctic",
	"bge-", "e5-", "gte-", "nomic-bert",
}

func isEmbeddingModel(name string, families []string, family string) bool {
	lower := strings.ToLower(name)
	for _, p := range embeddingNamePatterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	for _, f := range families {
		fl := strings.ToLower(f)
		if strings.Contains(fl, "bert") || strings.Contains(fl, "embed") {
			return true
		}
	}
	if fl := strings.ToLower(family); strings.Contains(fl, "bert") || strings.Contains(fl, "embed") {
		return true
	}
	return false
}
