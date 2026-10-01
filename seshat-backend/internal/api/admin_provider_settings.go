package api

import (
	"net/http"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	cloudsettings "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/settings"
)

// Admin Console's organization-wide Providers tab — deliberately separate
// from /settings/providers (settings.Provider, this device's own personal
// keys). Writes here go straight to seshat-server's real
// automation.ProviderSetting CRUD, the same store seshat-console's
// ProviderSettingsPage.tsx edits, so a change made from Admin Console shows
// up there immediately and vice versa. No local/standalone equivalent
// exists (there's no "organization" at all outside connected mode), so
// this mirrors jobsClientForRequest's direct-passthrough shape
// (automation_jobs.go) rather than the settings.Provider interface
// abstraction used for personal keys.

func (a *App) adminProviderSettingsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudsettings.Client, string, string, bool) {
	if a.connectedServerURL == "" {
		writeJSONError(w, http.StatusBadRequest, "this device is not connected to an organization server")
		return nil, "", "", false
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return nil, "", "", false
	}
	if err := backendauth.EnsureAdmin(principal); err != nil {
		writeBackendError(w, err)
		return nil, "", "", false
	}
	return cloudsettings.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAdminProviderSettings — GET/POST /api/v1/admin/provider-settings
func (a *App) handleAdminProviderSettings(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminProviderSettingsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		settings, err := client.ListOrgProviderSettings(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"provider_settings": settings, "count": len(settings)})
	case http.MethodPost:
		var req struct {
			Provider     string `json:"provider"`
			DefaultModel string `json:"default_model"`
			BaseURL      string `json:"base_url"`
			APIKey       string `json:"api_key"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := client.CreateOrgProviderSetting(r.Context(), token, cloudsettings.CreateOrgProviderSettingParams{
			OrganizationID: organizationID,
			Provider:       req.Provider,
			DefaultModel:   req.DefaultModel,
			BaseURL:        req.BaseURL,
			APIKey:         req.APIKey,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, setting)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminProviderSettingDispatch — GET/PUT/DELETE
// /api/v1/admin/provider-settings/{id} and POST .../set-default, .../unset-default.
func (a *App) handleAdminProviderSettingDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.adminProviderSettingsClientForRequest(w, r)
	if !ok {
		return
	}

	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/provider-settings/"), "/")
	if rest == "" {
		writeJSONError(w, http.StatusNotFound, "provider setting id is required")
		return
	}
	id, action, _ := strings.Cut(rest, "/")

	switch {
	case action == "" && r.Method == http.MethodPut:
		var req struct {
			DefaultModel string `json:"default_model"`
			BaseURL      string `json:"base_url"`
			APIKey       string `json:"api_key"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		setting, err := client.UpdateOrgProviderSetting(r.Context(), token, id, cloudsettings.UpdateOrgProviderSettingParams{
			DefaultModel: req.DefaultModel,
			BaseURL:      req.BaseURL,
			APIKey:       req.APIKey,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, setting)

	case action == "" && r.Method == http.MethodDelete:
		if err := client.DeleteOrgProviderSetting(r.Context(), token, id); err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		w.WriteHeader(http.StatusNoContent)

	case action == "set-default" && r.Method == http.MethodPost:
		setting, err := client.SetOrgProviderSettingDefault(r.Context(), token, id, true)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, setting)

	case action == "unset-default" && r.Method == http.MethodPost:
		setting, err := client.SetOrgProviderSettingDefault(r.Context(), token, id, false)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, setting)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
