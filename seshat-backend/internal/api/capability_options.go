package api

import (
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	backendsettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

// GET /api/v1/settings/capability-options
// PUT /api/v1/settings/capability-options/{capability}   {"options": {"model": "..."}}
//
// The choices a person makes for image generation and audio besides the provider: the image model, the speech to text model, and the
// model, voice and format of speech synthesis. A PUT replaces the saved choices of that capability; an empty value clears one.
func (a *App) handleCapabilityOptions(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if a.capabilityLinkStore == nil {
		writeBackendError(w, bkerr.Unavailable("capability options not available", nil))
		return
	}

	tail := strings.TrimPrefix(strings.TrimRight(r.URL.Path, "/"), "/settings/capability-options")
	tail = strings.TrimPrefix(tail, "/")

	if tail == "" {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		all := map[string]map[string]string{}
		for capability := range backendsettings.CapabilityOptionNames {
			options, err := a.capabilityLinkStore.Options(r.Context(), string(capability))
			if err != nil {
				writeBackendError(w, bkerr.Internal("failed to read capability options", err))
				return
			}
			all[string(capability)] = options
		}
		writeJSON(w, http.StatusOK, map[string]any{"options": all, "catalog": map[string]any{"image": sdk.ImageProviders()}})
		return
	}

	capability := backendsettings.Capability(tail)
	if len(backendsettings.CapabilityOptionNames[capability]) == 0 {
		writeBackendError(w, bkerr.InvalidInput("unknown capability", nil))
		return
	}
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Options map[string]string `json:"options"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	cleaned, err := backendsettings.ValidateCapabilityOptions(capability, body.Options)
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}
	if err := a.capabilityLinkStore.SetOptions(r.Context(), string(capability), cleaned); err != nil {
		writeBackendError(w, bkerr.Internal("failed to save capability options", err))
		return
	}
	saved, err := a.capabilityLinkStore.Options(r.Context(), string(capability))
	if err != nil {
		writeBackendError(w, bkerr.Internal("failed to read capability options", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"options": saved})
}
