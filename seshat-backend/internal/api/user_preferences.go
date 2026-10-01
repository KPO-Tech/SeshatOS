package api

import (
	"context"
	"net/http"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/preferences"
	"github.com/KPO-Tech/seshat/pkg/types"
)

type userPreferencesResponse struct {
	UserID                    string `json:"user_id"`
	PreferredName             string `json:"preferred_name"`
	Profession                string `json:"profession"`
	About                     string `json:"about"`
	WorkingStyle              string `json:"working_style"`
	ResponseStyle             string `json:"response_style"`
	ExtraContext              string `json:"extra_context"`
	InteractivePermissionMode string `json:"interactive_permission_mode"`
	AutomationPermissionMode  string `json:"automation_permission_mode"`
	// MaxSubAgentDepth is the user-configured spawn depth limit (1–5). 0 = server default (3).
	MaxSubAgentDepth int   `json:"max_sub_agent_depth"`
	UpdatedAt        int64 `json:"updated_at,omitempty"`
}

func prefsToResponse(p *preferences.UserPreferences) userPreferencesResponse {
	if p == nil {
		return userPreferencesResponse{}
	}
	return userPreferencesResponse{
		UserID:                    p.UserID,
		PreferredName:             p.PreferredName,
		Profession:                p.Profession,
		About:                     p.About,
		WorkingStyle:              p.WorkingStyle,
		ResponseStyle:             p.ResponseStyle,
		ExtraContext:              p.ExtraContext,
		InteractivePermissionMode: p.InteractivePermissionMode,
		AutomationPermissionMode:  p.AutomationPermissionMode,
		MaxSubAgentDepth:          p.MaxSubAgentDepth,
		UpdatedAt:                 p.UpdatedAt.Unix(),
	}
}

// enrichContextWithAgentPrefs injects per-user agent configuration values into
// the request context so they propagate to the agent tool deep in the stack
// without an extra DB read per sub-agent invocation.
func (app *App) enrichContextWithAgentPrefs(ctx context.Context, principal *backendauth.Principal) context.Context {
	if principal == nil {
		return ctx
	}
	// Inject user ID so memory tools can scope operations without an extra DB read.
	ctx = types.WithAgentUserID(ctx, principal.User.ID)
	// Inject the full principal too - tools that need org-scoped/permission-
	// aware access (e.g. internal/knowledge/tool's cross-corpus search) need
	// more than a bare user ID, and have no *http.Request to read it from
	// this deep into the query engine's call stack.
	ctx = backendauth.WithContext(ctx, principal)

	maxDepth, err := app.backend.Preferences.GetMaxSubAgentDepth(ctx, principal)
	if err != nil || maxDepth <= 0 {
		return ctx
	}
	return types.WithSubAgentMaxDepth(ctx, maxDepth)
}

// GET /api/v1/users/me/preferences
// PUT /api/v1/users/me/preferences
func (a *App) handleUserPreferences(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok || principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		prefs, err := a.backend.Preferences.Get(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, prefsToResponse(prefs))

	case http.MethodPut:
		var body struct {
			PreferredName             string `json:"preferred_name"`
			Profession                string `json:"profession"`
			About                     string `json:"about"`
			WorkingStyle              string `json:"working_style"`
			ResponseStyle             string `json:"response_style"`
			ExtraContext              string `json:"extra_context"`
			InteractivePermissionMode string `json:"interactive_permission_mode"`
			AutomationPermissionMode  string `json:"automation_permission_mode"`
			MaxSubAgentDepth          int    `json:"max_sub_agent_depth"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if body.InteractivePermissionMode != "" {
			if _, ok := types.NormalizePermissionMode(body.InteractivePermissionMode); !ok {
				writeJSONError(w, http.StatusBadRequest, "invalid interactive_permission_mode")
				return
			}
		}
		if body.AutomationPermissionMode != "" {
			if _, ok := types.NormalizePermissionMode(body.AutomationPermissionMode); !ok {
				writeJSONError(w, http.StatusBadRequest, "invalid automation_permission_mode")
				return
			}
		}
		saved, err := a.backend.Preferences.Upsert(r.Context(), principal, preferences.UpsertParams{
			PreferredName:             body.PreferredName,
			Profession:                body.Profession,
			About:                     body.About,
			WorkingStyle:              body.WorkingStyle,
			ResponseStyle:             body.ResponseStyle,
			ExtraContext:              body.ExtraContext,
			InteractivePermissionMode: body.InteractivePermissionMode,
			AutomationPermissionMode:  body.AutomationPermissionMode,
			MaxSubAgentDepth:          body.MaxSubAgentDepth,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, prefsToResponse(saved))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
