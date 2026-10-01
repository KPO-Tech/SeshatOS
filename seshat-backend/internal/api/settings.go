package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	backendaudit "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/audit"
	bksettings "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
	"github.com/KPO-Tech/seshat/pkg/providers"
)

type settingResponse struct {
	ID                string `json:"id"`
	UserID            string `json:"user_id"`
	Provider          string `json:"provider"`
	Name              string `json:"name"`
	AuthKind          string `json:"auth_kind"`
	BaseURL           string `json:"base_url,omitempty"`
	ModelID           string `json:"model_id,omitempty"`
	HasAPIKey         bool   `json:"has_api_key"`
	IsDefault         bool   `json:"is_default"`
	ConnectionStatus  string `json:"connection_status"`
	LastError         string `json:"last_error,omitempty"`
	OAuthAccountEmail string `json:"oauth_account_email,omitempty"`
	OAuthSubject      string `json:"oauth_subject,omitempty"`
	OAuthExpiresAt    int64  `json:"oauth_expires_at,omitempty"`
	CreatedAt         int64  `json:"created_at"`
	UpdatedAt         int64  `json:"updated_at"`
}

func settingToResponse(s bksettings.ProviderSetting) settingResponse {
	oauthExpiresAt := int64(0)
	if !s.OAuthExpiresAt.IsZero() {
		oauthExpiresAt = s.OAuthExpiresAt.Unix()
	}
	return settingResponse{
		ID:                s.ID,
		UserID:            s.UserID,
		Provider:          s.Provider,
		Name:              s.Name,
		AuthKind:          s.AuthKind,
		BaseURL:           s.BaseURL,
		ModelID:           s.ModelID,
		HasAPIKey:         s.HasAPIKey,
		IsDefault:         s.IsDefault,
		ConnectionStatus:  s.ConnectionStatus,
		LastError:         s.LastError,
		OAuthAccountEmail: s.OAuthAccountEmail,
		OAuthSubject:      s.OAuthSubject,
		OAuthExpiresAt:    oauthExpiresAt,
		CreatedAt:         s.CreatedAt.Unix(),
		UpdatedAt:         s.UpdatedAt.Unix(),
	}
}

// handleProviderSettings handles GET /settings/providers and POST /settings/providers.
func (a *App) handleProviderSettings(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	switch r.Method {
	case http.MethodGet:
		list, err := a.backend.Settings.List(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		items := make([]settingResponse, 0, len(list))
		for _, s := range list {
			items = append(items, settingToResponse(s))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"settings": items,
			"count":    len(items),
		})

	case http.MethodPost:
		var body struct {
			Provider string `json:"provider"`
			Name     string `json:"name"`
			AuthKind string `json:"auth_kind"`
			BaseURL  string `json:"base_url"`
			ModelID  string `json:"model_id"`
			APIKey   string `json:"api_key"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		setting, err := a.backend.Settings.Create(r.Context(), principal, bksettings.CreateSettingParams{
			Provider: body.Provider,
			Name:     body.Name,
			AuthKind: body.AuthKind,
			BaseURL:  body.BaseURL,
			ModelID:  body.ModelID,
			APIKey:   body.APIKey,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		a.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionSettingsCreate,
			ResourceType: "provider_setting",
			ResourceID:   setting.ID,
			IPAddress:    a.clientIP(r),
		})

		// Seed catalog models synchronously so they're available immediately when
		// the user expands the provider card. For Ollama we try a live fetch first
		// (fast 3-second timeout); for all providers we always fall back to the
		// static registry so the response is instant regardless.
		a.seedModelsForNewProvider(setting.ID, body.Provider, body.BaseURL)

		// See capability_autolink.go: makes this provider's key usable for
		// image/audio/embeddings automatically, without a separate manual step.
		a.autoLinkCapabilitiesFromProvider(r.Context(), setting.ID, setting.Provider, setting.HasAPIKey)

		writeJSON(w, http.StatusCreated, settingToResponse(*setting))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleProviderSettingByID handles /settings/providers/{id} and sub-resources:
//
//	GET    /settings/providers/{id}              → setting metadata
//	PUT    /settings/providers/{id}              → update fields
//	DELETE /settings/providers/{id}              → delete setting
//	*      /settings/providers/{id}/oauth/...    → OAuth flow
//	*      /settings/providers/{id}/models[/...] → model CRUD
func (a *App) handleProviderSettingByID(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Strip prefix and split into parts
	trimmed := strings.TrimPrefix(r.URL.Path, "/settings/providers/")
	trimmed = strings.Trim(trimmed, "/")
	parts := strings.SplitN(trimmed, "/", 3) // [settingID, sub, rest]

	settingID := parts[0]
	if settingID == "" {
		writeJSONError(w, http.StatusBadRequest, "setting id is required")
		return
	}

	if len(parts) >= 2 {
		switch parts[1] {
		case "set-default":
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			updated, err := a.backend.Settings.SetDefault(r.Context(), principal, settingID)
			if err != nil {
				writeBackendError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, settingToResponse(*updated))
			return
		case "oauth":
			a.handleProviderSettingOAuth(w, r)
			return
		case "models":
			// /settings/providers/{id}/models[/{modelId}[/sync]]
			if len(parts) == 3 && parts[2] != "" {
				modelSub := parts[2]
				if modelSub == "sync" {
					// POST /settings/providers/{id}/models/sync
					a.handleProviderModels(w, r, settingID)
					return
				}
				a.handleProviderModelByID(w, r, settingID, modelSub)
				return
			}
			a.handleProviderModels(w, r, settingID)
			return
		}
	}

	id := settingID

	switch r.Method {
	case http.MethodGet:
		setting, err := a.backend.Settings.Get(r.Context(), principal, id)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, settingToResponse(*setting))

	case http.MethodPut:
		var body struct {
			Name     *string `json:"name"`
			AuthKind *string `json:"auth_kind"`
			BaseURL  *string `json:"base_url"`
			ModelID  *string `json:"model_id"`
			APIKey   *string `json:"api_key"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		updated, err := a.backend.Settings.Update(r.Context(), principal, id, bksettings.UpdateSettingParams{
			Name:     body.Name,
			AuthKind: body.AuthKind,
			BaseURL:  body.BaseURL,
			ModelID:  body.ModelID,
			APIKey:   body.APIKey,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		a.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionSettingsUpdate,
			ResourceType: "provider_setting",
			ResourceID:   id,
			IPAddress:    a.clientIP(r),
		})
		// See capability_autolink.go - covers the case where a provider was
		// created without a key and one is added later via edit.
		a.autoLinkCapabilitiesFromProvider(r.Context(), id, updated.Provider, updated.HasAPIKey)
		writeJSON(w, http.StatusOK, settingToResponse(*updated))

	case http.MethodDelete:
		if err := a.backend.Settings.Delete(r.Context(), principal, id); err != nil {
			writeBackendError(w, err)
			return
		}
		// A capability link pointing at this now-deleted provider must not
		// linger — resolveCapabilityCredential would otherwise silently keep
		// failing forever instead of falling back cleanly. Best-effort: this
		// only matters in standalone mode where capabilityLinkStore is set.
		if a.capabilityLinkStore != nil {
			_ = a.capabilityLinkStore.DeleteByProviderSettingID(r.Context(), id)
		}
		a.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionSettingsDelete,
			ResourceType: "provider_setting",
			ResourceID:   id,
			IPAddress:    a.clientIP(r),
		})
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// seedModelsForNewProvider seeds catalog models after a provider is created.
// Always seeds from the static registry first (instant). For Ollama, also
// attempts a live fetch with a short timeout to replace with actually-installed
// models; on failure the static catalog remains.
func (a *App) seedModelsForNewProvider(settingID, providerName, baseURL string) {
	if a.modelStore == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	// Start with the static registry — always fast, works offline
	staticParams := providers.StaticModels(providerName)
	if len(staticParams) > 0 {
		_, _ = a.modelStore.SeedCatalogModels(ctx, settingID, toDBParams(staticParams))
	}

	// For Ollama: try a live fetch to get actually-installed models
	if strings.ToLower(providerName) == "ollama" {
		url := strings.TrimRight(baseURL, "/")
		if url == "" {
			url = providers.DefaultBaseURL("ollama")
		}
		if fetched, err := providers.FetchModels(ctx, "ollama", url, ""); err == nil && len(fetched) > 0 {
			_, _ = a.modelStore.BulkReplaceCatalog(ctx, settingID, toDBParams(fetched))
		}
	}
}

func (a *App) handleProviderSettingOAuth(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/settings/providers/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] != "oauth" {
		writeJSONError(w, http.StatusNotFound, "unknown settings oauth route")
		return
	}
	id := parts[0]
	subresource := ""
	if len(parts) > 2 {
		subresource = parts[2]
	}

	switch {
	case r.Method == http.MethodPost && subresource == "start":
		challenge, err := a.backend.Settings.StartOAuth(r.Context(), principal, id)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status":                challenge.Status,
			"user_code":             challenge.UserCode,
			"verification_url":      challenge.VerificationURL,
			"poll_interval_seconds": challenge.PollIntervalSeconds,
			"expires_at":            challenge.ExpiresAt.Unix(),
		})
	case r.Method == http.MethodPost && subresource == "poll":
		setting, err := a.backend.Settings.PollOAuth(r.Context(), principal, id)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, settingToResponse(*setting))
	case r.Method == http.MethodDelete && subresource == "":
		setting, err := a.backend.Settings.DisconnectOAuth(r.Context(), principal, id)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, settingToResponse(*setting))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
