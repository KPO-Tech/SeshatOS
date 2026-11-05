package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	backendaudit "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/audit"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	bksettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
	appconfig "github.com/KPO-Tech/seshat-runtime/pkg/config"
	"github.com/KPO-Tech/seshat-runtime/pkg/providers"
)

// ─── Response type ────────────────────────────────────────────────────────────

type providerModelResponse struct {
	ID                 string  `json:"id"`
	ProviderSettingID  string  `json:"provider_setting_id"`
	ModelID            string  `json:"model_id"`
	DisplayName        string  `json:"display_name"`
	ContextWindow      int     `json:"context_window"`
	MaxOutput          int     `json:"max_output"`
	DefaultTemperature float64 `json:"default_temperature"`
	Description        string  `json:"description,omitempty"`
	IsDefault          bool    `json:"is_default"`
	SortOrder          int     `json:"sort_order"`
	Source             string  `json:"source"` // "catalog" or "user"
	CreatedAt          int64   `json:"created_at"`
	UpdatedAt          int64   `json:"updated_at"`
}

func modelToResponse(m db.ProviderModel) providerModelResponse {
	source := m.Source
	if source == "" {
		source = "user"
	}
	return providerModelResponse{
		ID:                m.ID,
		ProviderSettingID: m.ProviderSettingID,
		ModelID:           m.ModelID,
		DisplayName:       m.DisplayName,
		ContextWindow:     m.ContextWindow,
		MaxOutput:         m.MaxOutput,
		IsDefault:         m.IsDefault,
		SortOrder:         m.SortOrder,
		Source:            source,
		CreatedAt:         m.CreatedAt.Unix(),
		UpdatedAt:         m.UpdatedAt.Unix(),
	}
}

// toDBParams converts provider-neutral FetchedModels to DB insert params.
func toDBParams(models []providers.FetchedModel) []db.CreateProviderModelParams {
	out := make([]db.CreateProviderModelParams, len(models))
	for i, m := range models {
		out[i] = db.CreateProviderModelParams{
			ModelID:       m.ModelID,
			DisplayName:   m.DisplayName,
			ContextWindow: m.ContextWindow,
			MaxOutput:     m.MaxOutput,
			IsDefault:     m.IsDefault,
			SortOrder:     m.SortOrder,
			Source:        "catalog",
		}
	}
	return out
}

// ─── Models collection: GET /settings/providers/{id}/models
//                        POST /settings/providers/{id}/models
//                        POST /settings/providers/{id}/models/sync

func (a *App) handleProviderModels(w http.ResponseWriter, r *http.Request, settingID string) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Verify the setting belongs to this user (or user is admin)
	setting, err := a.backend.Settings.Get(r.Context(), principal, settingID)
	if err != nil {
		writeBackendError(w, err)
		return
	}

	// /models/sync sub-action
	if strings.HasSuffix(strings.TrimRight(r.URL.Path, "/"), "/sync") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleProviderModelsSync(w, r, settingID, setting.Provider, setting.BaseURL)
		return
	}

	switch r.Method {
	case http.MethodGet:
		models, err := a.modelStore.ListBySettingID(r.Context(), settingID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		providerEnum := providers.ResolveProviderFromString(bksettings.RuntimeProvider(setting.Provider))

		// FreeLLMAPI has no list of its own in the runtime: its models are the ones the router says it can serve now, asked when the
		// list is empty (a new setting) and again by Sync.
		freeLLMAPI := bksettings.IsFreeLLMAPI(setting.Provider)
		if freeLLMAPI && len(models) == 0 {
			apiKey, _ := a.backend.Settings.GetDecryptedAPIKey(r.Context(), principal, settingID)
			if synced, syncErr := a.replaceFreeLLMAPIModels(r.Context(), settingID, setting.BaseURL, apiKey); syncErr == nil {
				models = synced
			}
		}

		// Auto-seed if DB is empty or contains models from the wrong provider.
		knownIDs := make([]string, len(models))
		for i, m := range models {
			knownIDs[i] = m.ModelID
		}
		if !freeLLMAPI && providers.NeedsCatalogReseed(setting.Provider, knownIDs) {
			if static := providers.StaticModels(setting.Provider); len(static) > 0 {
				if seeded, seedErr := a.modelStore.BulkReplaceCatalog(r.Context(), settingID, toDBParams(static)); seedErr == nil {
					models = seeded
				}
			}
		}

		items := make([]providerModelResponse, 0, len(models))
		for _, m := range models {
			resp := modelToResponse(m)
			if info, ok := providers.GetModelInfo(providerEnum, m.ModelID); ok {
				resp.Description = info.Description
				resp.DefaultTemperature = info.DefaultTemperature
			}
			items = append(items, resp)
		}
		writeJSON(w, http.StatusOK, map[string]any{"models": items, "count": len(items)})

	case http.MethodPost:
		var body struct {
			ModelID       string `json:"model_id"`
			DisplayName   string `json:"display_name"`
			ContextWindow int    `json:"context_window"`
			MaxOutput     int    `json:"max_output"`
			IsDefault     bool   `json:"is_default"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if strings.TrimSpace(body.ModelID) == "" {
			writeJSONError(w, http.StatusBadRequest, "model_id is required")
			return
		}
		// Count existing for sort_order
		existing, _ := a.modelStore.ListBySettingID(r.Context(), settingID)
		model, err := a.modelStore.Create(r.Context(), db.CreateProviderModelParams{
			ProviderSettingID: settingID,
			ModelID:           body.ModelID,
			DisplayName:       body.DisplayName,
			ContextWindow:     body.ContextWindow,
			MaxOutput:         body.MaxOutput,
			IsDefault:         body.IsDefault,
			SortOrder:         len(existing),
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		a.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionSettingsCreate,
			ResourceType: "provider_model",
			ResourceID:   model.ID,
			IPAddress:    a.clientIP(r),
		})
		writeJSON(w, http.StatusCreated, modelToResponse(*model))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Single model: GET /settings/providers/{id}/models/{modelId}
//                   PUT /settings/providers/{id}/models/{modelId}
//                   DELETE /settings/providers/{id}/models/{modelId}

func (a *App) handleProviderModelByID(w http.ResponseWriter, r *http.Request, settingID, modelID string) {
	writeNotFound := func(err error) bool {
		if errors.Is(err, db.ErrProviderModelNotFound) {
			writeJSONError(w, http.StatusNotFound, err.Error())
			return true
		}
		return false
	}

	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Verify setting ownership
	if _, err := a.backend.Settings.Get(r.Context(), principal, settingID); err != nil {
		writeBackendError(w, err)
		return
	}

	switch r.Method {
	case http.MethodGet:
		model, err := a.modelStore.GetByIDForSetting(r.Context(), settingID, modelID)
		if err != nil {
			if writeNotFound(err) {
				return
			}
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, modelToResponse(*model))

	case http.MethodPut:
		var body struct {
			ModelID       *string `json:"model_id"`
			DisplayName   *string `json:"display_name"`
			ContextWindow *int    `json:"context_window"`
			MaxOutput     *int    `json:"max_output"`
			IsDefault     *bool   `json:"is_default"`
			SortOrder     *int    `json:"sort_order"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		updated, err := a.modelStore.UpdateForSetting(r.Context(), settingID, modelID, db.UpdateProviderModelParams{
			ModelID:       body.ModelID,
			DisplayName:   body.DisplayName,
			ContextWindow: body.ContextWindow,
			MaxOutput:     body.MaxOutput,
			IsDefault:     body.IsDefault,
			SortOrder:     body.SortOrder,
		})
		if err != nil {
			if writeNotFound(err) {
				return
			}
			writeBackendError(w, err)
			return
		}
		a.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionSettingsUpdate,
			ResourceType: "provider_model",
			ResourceID:   modelID,
			IPAddress:    a.clientIP(r),
		})
		writeJSON(w, http.StatusOK, modelToResponse(*updated))

	case http.MethodDelete:
		if err := a.modelStore.DeleteForSetting(r.Context(), settingID, modelID); err != nil {
			if writeNotFound(err) {
				return
			}
			writeBackendError(w, err)
			return
		}
		a.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionSettingsDelete,
			ResourceType: "provider_model",
			ResourceID:   modelID,
			IPAddress:    a.clientIP(r),
		})
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Sync: POST /settings/providers/{id}/models/sync ─────────────────────────

func (a *App) handleProviderModelsSync(w http.ResponseWriter, r *http.Request, settingID, providerName, baseURL string) {
	principal, _ := authPrincipalFromContext(r.Context())

	// Decrypt API key (may be empty for providers like Ollama)
	apiKey, _ := a.backend.Settings.GetDecryptedAPIKey(r.Context(), principal, settingID)

	if bksettings.IsFreeLLMAPI(providerName) {
		models, err := a.replaceFreeLLMAPIModels(r.Context(), settingID, baseURL, apiKey)
		if err != nil {
			// There is no static list to fall back on: say why the router could not be read.
			writeBackendError(w, bkerr.BadGateway(err.Error(), err))
			return
		}
		items := make([]providerModelResponse, 0, len(models))
		for _, m := range models {
			items = append(items, modelToResponse(m))
		}
		writeJSON(w, http.StatusOK, map[string]any{"models": items, "count": len(items), "synced": true})
		return
	}

	fetched, err := providers.FetchModels(r.Context(), providerName, baseURL, apiKey)
	if err != nil {
		// Fall back to static catalog from registry
		fetched = providers.StaticModels(providerName)
	}

	models, err := a.modelStore.BulkReplaceCatalog(r.Context(), settingID, toDBParams(fetched))
	if err != nil {
		writeBackendError(w, err)
		return
	}

	items := make([]providerModelResponse, 0, len(models))
	for _, m := range models {
		items = append(items, modelToResponse(m))
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": items, "count": len(items), "synced": true})
}

// ─── GET /api/v1/models ───────────────────────────────────────────────────────

// providerCatalogModel/providerCatalogEntry mirror seshat-server's
// GET /provider-catalog response shape (internal/server/api/provider_catalog.go)
// so seshat-console and the desktop app can share the same mental model of "the
// dynamic catalog response" even though the two are separate Go modules.
type providerCatalogModel struct {
	ID            string `json:"id"`
	Description   string `json:"description,omitempty"`
	ContextWindow int    `json:"context_window,omitempty"`
	MaxOutput     int    `json:"max_output,omitempty"`
}

type providerCatalogEntry struct {
	Name        string                 `json:"name"`
	DisplayName string                 `json:"display_name"`
	Description string                 `json:"description,omitempty"`
	AuthType    string                 `json:"auth_type"`
	AuthTypes   []string               `json:"auth_types,omitempty"`
	Models      []providerCatalogModel `json:"models"`
}

// handleModelsList returns, live from the SDK's own registry rather than a
// hand-maintained copy, which providers/models this build of seshat
// supports - the desktop app previously hardcoded its own copy of this list
// (ProvidersView.tsx: SUPPORTED_PROVIDERS/PROVIDER_DEFAULT_URLS/
// PROVIDER_DISPLAY_ORDER), which had already drifted out of sync with the
// SDK once. Uses pkg/config.AvailableProviders (not the lower-level
// pkg/providers.AllProvidersInfo) so the response comes back in the SDK's
// own curated display order - callers don't need their own ordering table.
func handleModelsList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	providerInfos := appconfig.AvailableProviders()
	entries := make([]providerCatalogEntry, 0, len(providerInfos))
	modelCount := 0
	for _, info := range providerInfos {
		models := make([]providerCatalogModel, 0, len(info.Models))
		for _, m := range info.Models {
			models = append(models, providerCatalogModel{
				ID:            m.Identifier,
				Description:   m.Description,
				ContextWindow: m.ContextWindow,
				MaxOutput:     m.MaxOutput,
			})
			modelCount++
		}
		entries = append(entries, providerCatalogEntry{
			Name:        string(info.Name),
			DisplayName: info.DisplayName,
			Description: info.Description,
			AuthType:    info.AuthType,
			AuthTypes:   append([]string(nil), info.AuthTypes...),
			Models:      models,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"providers":   entries,
		"count":       len(entries),
		"total_count": modelCount,
	})
}

// replaceFreeLLMAPIModels asks the router which models it can serve now and makes them the models of the setting (the first one, "auto",
// is the default). The models the user added by hand stay.
func (a *App) replaceFreeLLMAPIModels(ctx context.Context, settingID, baseURL, apiKey string) ([]db.ProviderModel, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	listed, err := bksettings.FetchFreeLLMAPIModels(ctx, &http.Client{Timeout: 12 * time.Second}, baseURL, apiKey)
	if err != nil {
		return nil, err
	}
	fetched := make([]providers.FetchedModel, 0, len(listed))
	for i, model := range listed {
		name := model.Name
		if name == "" {
			name = model.ID
		}
		fetched = append(fetched, providers.FetchedModel{ModelID: model.ID, DisplayName: name, ContextWindow: model.ContextWindow, IsDefault: i == 0, SortOrder: i})
	}
	return a.modelStore.BulkReplaceCatalog(ctx, settingID, toDBParams(fetched))
}
