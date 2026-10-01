package api

import (
	"net/http"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	cloudagents "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/agents"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Admin Console's Agents tab — deliberately separate from the embedded
// WorkspacePage's own "Agents" view (this device's personal agents, plus a
// read-only enrichment from the org's shared preset catalog - see
// internal/agents.Service.ListOrganizationPresets). Writes here go straight
// to seshat-server's real agentregistry.AgentPreset CRUD, the same one
// seshat-console's AgentPresetsPage.tsx edits, so a change made from Admin
// Console shows up there immediately and vice versa. No local/standalone
// equivalent exists (there's no "organization" at all outside connected
// mode), so this mirrors adminTeamsClientForRequest's shape.

func (a *App) adminAgentPresetsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudagents.Client, string, string, bool) {
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
	return cloudagents.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAdminAgentPresets — GET/POST /api/v1/admin/agent-presets
func (a *App) handleAdminAgentPresets(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminAgentPresetsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		presets, err := client.ListPresets(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"agent_presets": presets, "count": len(presets)})
	case http.MethodPost:
		var req struct {
			Slug            string   `json:"slug"`
			Name            string   `json:"name"`
			WhenToUse       string   `json:"when_to_use"`
			SystemPrompt    string   `json:"system_prompt"`
			Model           string   `json:"model"`
			Tools           []string `json:"tools"`
			DisallowedTools []string `json:"disallowed_tools"`
			MaxTurns        int      `json:"max_turns"`
			PermissionMode  string   `json:"permission_mode"`
			Isolation       string   `json:"isolation"`
			McpServers      []string `json:"mcp_servers"`
			Icon            string   `json:"icon"`
			Enabled         *bool    `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		preset, err := client.CreatePreset(r.Context(), token, cloudagents.CreatePresetParams{
			OrganizationID:  organizationID,
			Slug:            req.Slug,
			Name:            req.Name,
			WhenToUse:       req.WhenToUse,
			SystemPrompt:    req.SystemPrompt,
			Model:           req.Model,
			Tools:           req.Tools,
			DisallowedTools: req.DisallowedTools,
			MaxTurns:        req.MaxTurns,
			PermissionMode:  req.PermissionMode,
			Isolation:       req.Isolation,
			McpServers:      req.McpServers,
			Icon:            req.Icon,
			Enabled:         req.Enabled,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, preset)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminAgentPresetDispatch — PUT/DELETE /api/v1/admin/agent-presets/{id}
func (a *App) handleAdminAgentPresetDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.adminAgentPresetsClientForRequest(w, r)
	if !ok {
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/agent-presets/"), "/")
	if id == "" {
		writeJSONError(w, http.StatusNotFound, "agent preset id is required")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req struct {
			Name            *string  `json:"name"`
			WhenToUse       *string  `json:"when_to_use"`
			SystemPrompt    *string  `json:"system_prompt"`
			Model           *string  `json:"model"`
			Tools           []string `json:"tools"`
			DisallowedTools []string `json:"disallowed_tools"`
			MaxTurns        *int     `json:"max_turns"`
			PermissionMode  *string  `json:"permission_mode"`
			Isolation       *string  `json:"isolation"`
			McpServers      []string `json:"mcp_servers"`
			Icon            *string  `json:"icon"`
			Enabled         *bool    `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		preset, err := client.UpdatePreset(r.Context(), token, id, cloudagents.UpdatePresetParams{
			Name:            req.Name,
			WhenToUse:       req.WhenToUse,
			SystemPrompt:    req.SystemPrompt,
			Model:           req.Model,
			Tools:           req.Tools,
			DisallowedTools: req.DisallowedTools,
			MaxTurns:        req.MaxTurns,
			PermissionMode:  req.PermissionMode,
			Isolation:       req.Isolation,
			McpServers:      req.McpServers,
			Icon:            req.Icon,
			Enabled:         req.Enabled,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, preset)

	case http.MethodDelete:
		if err := client.DeletePreset(r.Context(), token, id); err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
