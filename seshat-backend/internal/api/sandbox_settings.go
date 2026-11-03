package api

import (
	"context"
	"net/http"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/sandboxproject"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

// sandboxProtector applies the project sandbox's read refusals. sandboxproject.Host is the
// real one.
type sandboxProtector interface {
	Available() bool
	UnavailableReason() string
	Protect(ctx context.Context, capabilitySID string, paths []string) error
	Unprotect(ctx context.Context, capabilitySID string, paths []string) error
}

type sandboxConfigResponse struct {
	Mode             string `json:"mode"`
	UpdatedAt        int64  `json:"updated_at,omitempty"`
	ProjectAvailable bool   `json:"project_available"`
	// DirectConfined says Landlock confines commands in direct mode on this host.
	DirectConfined           bool     `json:"direct_confined"`
	DockerModeRemoved        bool     `json:"docker_mode_removed,omitempty"`
	ProjectUnavailableReason string   `json:"project_unavailable_reason,omitempty"`
	DenyRead                 []string `json:"deny_read"`
}

// sandboxDenyRead is the list in force: the user's once they changed it, the defaults before.
func (a *App) sandboxDenyRead(cfg *db.SandboxConfig) []string {
	if cfg != nil && cfg.DenyReadSet {
		return cfg.DenyRead
	}
	return a.sandboxDefaultDenyRead
}

func (a *App) sandboxConfigToResponse(cfg *db.SandboxConfig) sandboxConfigResponse {
	resp := sandboxConfigResponse{Mode: db.SandboxModeLocal, DenyRead: a.sandboxDenyRead(cfg), DirectConfined: sdk.SandboxAvailable()}
	resp.DockerModeRemoved = cfg != nil && cfg.DockerModeRemoved
	if resp.DenyRead == nil {
		resp.DenyRead = []string{}
	}
	if a.sandboxProject != nil && a.sandboxProject.Available() {
		resp.ProjectAvailable = true
	} else if a.sandboxProject != nil {
		resp.ProjectUnavailableReason = a.sandboxProject.UnavailableReason()
	}
	if cfg == nil || cfg.Mode == "" {
		// No row yet (fresh install) - see resolveSandboxMode in
		// bootstrap.go, which applies this same default at request time.
		return resp
	}
	resp.Mode = cfg.Mode
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		resp.UpdatedAt = cfg.UpdatedAt.Unix()
	}
	return resp
}

// applySandboxChange writes the refusals the new state needs before it is saved, so a
// folder that cannot be protected is said here and not as a session that refuses every
// command. A refusal the user took off the list is taken back from the disk at once.
func (a *App) applySandboxChange(ctx context.Context, current *db.SandboxConfig, mode string, denyRead []string) error {
	available := a.sandboxProject != nil && a.sandboxProject.Available()
	if mode == db.SandboxModeProject && !available {
		reason := "the project sandbox is not available"
		if a.sandboxProject != nil {
			reason = a.sandboxProject.UnavailableReason()
		}
		return bkerr.InvalidInput(reason, nil)
	}
	if !available {
		return nil
	}
	sid := ""
	if current != nil {
		sid = current.CapabilitySID
	}
	if removed := sandboxproject.Removed(a.sandboxDenyRead(current), denyRead); len(removed) > 0 && sid != "" {
		if err := a.sandboxProject.Unprotect(ctx, sid, removed); err != nil {
			return bkerr.Internal("failed to take the protection back: "+err.Error(), err)
		}
	}
	if mode != db.SandboxModeProject {
		return nil
	}
	sid, err := a.sandboxConfigStore.EnsureCapabilitySID(ctx)
	if err != nil {
		return bkerr.Internal("failed to set up the sandbox identity", err)
	}
	if err := a.sandboxProject.Protect(ctx, sid, denyRead); err != nil {
		return bkerr.InvalidInput(err.Error(), err)
	}
	return nil
}

// handleSandboxConfig — GET/PUT /api/v1/settings/sandbox. Lets the desktop
// Settings UI read/choose where bash-tool commands execute: directly on the host
// (db.SandboxModeLocal, the default) or on the host inside the runtime's sidecar (db.SandboxModeProject),
// and what that sidecar keeps from commands. See resolveSandboxMode in bootstrap.go for where this is
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
		writeJSON(w, http.StatusOK, a.sandboxConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			Mode     string    `json:"mode"`
			DenyRead *[]string `json:"deny_read"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		current, err := a.sandboxConfigStore.Get(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to get sandbox config", err))
			return
		}
		// Either field may come alone: the one left out keeps its value.
		mode := body.Mode
		if mode == "" {
			mode = a.sandboxConfigToResponse(current).Mode
		}
		denyRead := a.sandboxDenyRead(current)
		params := db.UpsertSandboxConfigParams{Mode: mode}
		if body.DenyRead != nil {
			cleaned := sandboxproject.CleanDenyRead(*body.DenyRead)
			denyRead = cleaned
			params.DenyRead = &cleaned
		}
		if !db.ValidSandboxMode(mode) {
			writeBackendError(w, bkerr.InvalidInput("unknown sandbox mode: "+mode, nil))
			return
		}
		if err := a.applySandboxChange(r.Context(), current, mode, denyRead); err != nil {
			writeBackendError(w, err)
			return
		}
		cfg, err := a.sandboxConfigStore.Upsert(r.Context(), params)
		if err != nil {
			writeBackendError(w, bkerr.InvalidInput(err.Error(), nil))
			return
		}
		writeJSON(w, http.StatusOK, a.sandboxConfigToResponse(cfg))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
