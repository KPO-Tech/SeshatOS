package api

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
)

type localTitleConfigResponse struct {
	BaseURL   string `json:"base_url,omitempty"`
	Model     string `json:"model,omitempty"`
	Enabled   bool   `json:"enabled"`
	UpdatedAt int64  `json:"updated_at,omitempty"`
}

func localTitleConfigToResponse(cfg *db.LocalTitleConfig) localTitleConfigResponse {
	if cfg == nil {
		return localTitleConfigResponse{}
	}
	resp := localTitleConfigResponse{BaseURL: cfg.BaseURL, Model: cfg.Model, Enabled: cfg.Enabled}
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		resp.UpdatedAt = cfg.UpdatedAt.Unix()
	}
	return resp
}

// handleLocalTitleConfig - GET/PUT /api/v1/settings/local-title. The Electron
// main process PUTs this once it has spawned llama-server with the chosen
// small model, so session titles are generated locally instead of by the chat
// provider. Reasoning models are refused (see settings.ValidateTitleModel).
func (a *App) handleLocalTitleConfig(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if a.localTitleStore == nil {
		writeBackendError(w, bkerr.Unavailable("local title config store not available", nil))
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := a.localTitleStore.Get(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to get local title config", err))
			return
		}
		writeJSON(w, http.StatusOK, localTitleConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			BaseURL string `json:"base_url"`
			Model   string `json:"model"`
			Enabled bool   `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if body.Enabled {
			if err := settings.ValidateTitleModel(body.Model); err != nil {
				writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
				return
			}
			if u, err := url.Parse(strings.TrimSpace(body.BaseURL)); err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
				writeBackendError(w, bkerr.InvalidInput("base_url must be an http(s) URL", err))
				return
			}
		}
		cfg, err := a.localTitleStore.Upsert(r.Context(), db.UpsertLocalTitleConfigParams{
			BaseURL: body.BaseURL,
			Model:   body.Model,
			Enabled: body.Enabled,
		})
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to save local title config", err))
			return
		}
		writeJSON(w, http.StatusOK, localTitleConfigToResponse(cfg))

	default:
		w.Header().Set("Allow", "GET, PUT")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
	}
}
