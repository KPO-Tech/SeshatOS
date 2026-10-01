package api

import (
	"net/http"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type sandboxConfigResponse struct {
	Mode      string `json:"mode"`
	UpdatedAt int64  `json:"updated_at,omitempty"`
}

func sandboxConfigToResponse(cfg *db.SandboxConfig) sandboxConfigResponse {
	if cfg == nil || cfg.Mode == "" {
		// No row yet (fresh install) - see resolveSandboxMode in
		// bootstrap.go, which applies this same default at request time.
		return sandboxConfigResponse{Mode: db.SandboxModeLocal}
	}
	var updatedAt int64
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		updatedAt = cfg.UpdatedAt.Unix()
	}
	return sandboxConfigResponse{Mode: cfg.Mode, UpdatedAt: updatedAt}
}

// handleSandboxConfig — GET/PUT /api/v1/settings/sandbox. Lets the desktop
// Settings UI read/choose where bash-tool commands execute: Docker-sandboxed
// (db.SandboxModeDocker) or directly on the host (db.SandboxModeLocal, the
// default). See resolveSandboxMode in bootstrap.go for where this is
// actually applied per request.
func (a *App) handleSandboxConfig(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if a.sandboxConfigStore == nil {
		writeBackendError(w, bkerr.Unavailable("sandbox config store not available", nil))
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := a.sandboxConfigStore.Get(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to get sandbox config", err))
			return
		}
		writeJSON(w, http.StatusOK, sandboxConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			Mode string `json:"mode"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		cfg, err := a.sandboxConfigStore.Upsert(r.Context(), db.UpsertSandboxConfigParams{Mode: body.Mode})
		if err != nil {
			writeBackendError(w, bkerr.InvalidInput(err.Error(), nil))
			return
		}
		writeJSON(w, http.StatusOK, sandboxConfigToResponse(cfg))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
