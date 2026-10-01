package api

import (
	"net/http"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

type localSTTConfigResponse struct {
	BaseURL   string `json:"base_url,omitempty"`
	Enabled   bool   `json:"enabled"`
	UpdatedAt int64  `json:"updated_at,omitempty"`
}

func localSTTConfigToResponse(cfg *db.LocalSTTConfig) localSTTConfigResponse {
	if cfg == nil {
		return localSTTConfigResponse{Enabled: false}
	}
	var updatedAt int64
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		updatedAt = cfg.UpdatedAt.Unix()
	}
	return localSTTConfigResponse{
		BaseURL:   cfg.BaseURL,
		Enabled:   cfg.Enabled,
		UpdatedAt: updatedAt,
	}
}

// handleLocalSTTConfig — GET/PUT /api/v1/settings/local-stt. The Electron
// main process PUTs this once it has downloaded whisper.cpp and spawned
// whisper-server locally, pointing /transcribe at it instead of a cloud
// provider (see transcribe.go). GET lets the renderer show current status.
func (a *App) handleLocalSTTConfig(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if a.localSTTStore == nil {
		writeBackendError(w, bkerr.Unavailable("local speech-to-text config store not available", nil))
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := a.localSTTStore.Get(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to get local speech-to-text config", err))
			return
		}
		writeJSON(w, http.StatusOK, localSTTConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			BaseURL string `json:"base_url"`
			Enabled bool   `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		cfg, err := a.localSTTStore.Upsert(r.Context(), db.UpsertLocalSTTConfigParams{
			BaseURL: body.BaseURL,
			Enabled: body.Enabled,
		})
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to save local speech-to-text config", err))
			return
		}
		writeJSON(w, http.StatusOK, localSTTConfigToResponse(cfg))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
