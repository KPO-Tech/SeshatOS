package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	backendsettings "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
)

// allCapabilities is the fixed set this endpoint reports on - see
// internal/settings/capabilities.go for what each one actually gates.
var allCapabilities = []backendsettings.Capability{
	backendsettings.CapabilityImage,
	backendsettings.CapabilityAudio,
	backendsettings.CapabilityEmbeddings,
}

type capabilityLinkCandidate struct {
	ID       string `json:"id"`
	Provider string `json:"provider"`
	Name     string `json:"name"`
	// BaseURL/Model are only populated for the "embeddings" capability -
	// see backendsettings.EmbedderDefaultsFor. Image/audio candidates don't
	// need them: the SDK only needs a key for those (see capabilities.go's
	// doc comments on why embeddings, uniquely, also needs a full
	// embedder_config row, not just a key).
	BaseURL string `json:"base_url,omitempty"`
	Model   string `json:"model,omitempty"`
}

type capabilityLinkStatus struct {
	Capability       string                    `json:"capability"`
	LinkedProviderID string                    `json:"linked_provider_id,omitempty"`
	LinkedProvider   string                    `json:"linked_provider,omitempty"`
	LinkedName       string                    `json:"linked_name,omitempty"`
	Candidates       []capabilityLinkCandidate `json:"candidates"`
}

// GET    /api/v1/settings/capability-links
// PUT    /api/v1/settings/capability-links/{capability}   {"provider_setting_id": "..."}
// DELETE /api/v1/settings/capability-links/{capability}
//
// Lets the user opt in to reusing an already-configured chat provider's API
// key for image generation, audio (TTS/STT), and embeddings, instead of
// pasting the same key again in Settings > Environment or the embedder
// config - see internal/db/capability_links.go's doc comment for why this
// is explicit opt-in rather than automatic.
func (a *App) handleCapabilityLinks(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if a.capabilityLinkStore == nil || a.providerSettingStore == nil {
		writeBackendError(w, bkerr.Unavailable("capability links not available", nil))
		return
	}

	tail := strings.TrimPrefix(strings.TrimRight(r.URL.Path, "/"), "/settings/capability-links")
	tail = strings.TrimPrefix(tail, "/")

	if tail == "" {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleListCapabilityLinks(w, r, principal.User.ID)
		return
	}

	capability := backendsettings.Capability(tail)
	if !capability.Valid() {
		writeBackendError(w, bkerr.InvalidInput("unknown capability", nil))
		return
	}

	switch r.Method {
	case http.MethodPut:
		var body struct {
			ProviderSettingID string `json:"provider_setting_id"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		providerSettingID := strings.TrimSpace(body.ProviderSettingID)
		if providerSettingID == "" {
			writeBackendError(w, bkerr.InvalidInput("provider_setting_id is required", nil))
			return
		}
		setting, err := a.providerSettingStore.GetByID(r.Context(), providerSettingID)
		if err != nil || setting.UserID != principal.User.ID {
			writeBackendError(w, bkerr.NotFound("provider setting not found", nil))
			return
		}
		if !backendsettings.SupportsCapability(setting.Provider, capability) {
			writeBackendError(w, bkerr.InvalidInput("this provider does not support "+string(capability), nil))
			return
		}
		if err := a.capabilityLinkStore.Set(r.Context(), string(capability), providerSettingID); err != nil {
			writeBackendError(w, bkerr.Internal("failed to save capability link", err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	case http.MethodDelete:
		if err := a.capabilityLinkStore.Delete(r.Context(), string(capability)); err != nil {
			writeBackendError(w, bkerr.Internal("failed to remove capability link", err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleListCapabilityLinks(w http.ResponseWriter, r *http.Request, userID string) {
	settings, err := a.providerSettingStore.ListByUserID(r.Context(), userID)
	if err != nil {
		writeBackendError(w, bkerr.Internal("failed to list providers", err))
		return
	}
	links, err := a.capabilityLinkStore.ListAll(r.Context())
	if err != nil {
		writeBackendError(w, bkerr.Internal("failed to list capability links", err))
		return
	}

	byID := make(map[string]db.ProviderSetting, len(settings))
	for _, s := range settings {
		byID[s.ID] = s
	}

	result := make([]capabilityLinkStatus, 0, len(allCapabilities))
	for _, capability := range allCapabilities {
		status := capabilityLinkStatus{Capability: string(capability), Candidates: []capabilityLinkCandidate{}}
		for _, s := range settings {
			if s.HasAPIKey && backendsettings.SupportsCapability(s.Provider, capability) {
				candidate := capabilityLinkCandidate{ID: s.ID, Provider: s.Provider, Name: s.Name}
				if capability == backendsettings.CapabilityEmbeddings {
					if defaults, ok := backendsettings.EmbedderDefaultsFor(s.Provider); ok {
						candidate.BaseURL = defaults.BaseURL
						candidate.Model = defaults.Model
					}
				}
				status.Candidates = append(status.Candidates, candidate)
			}
		}
		if link, ok := links[string(capability)]; ok {
			if setting, found := byID[link.ProviderSettingID]; found {
				status.LinkedProviderID = setting.ID
				status.LinkedProvider = setting.Provider
				status.LinkedName = setting.Name
			}
		}
		result = append(result, status)
	}
	writeJSON(w, http.StatusOK, map[string]any{"capabilities": result})
}
