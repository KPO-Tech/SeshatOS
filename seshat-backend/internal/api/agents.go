package api

import (
	"net/http"
	"strings"

	backendagents "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/agents"
	pkgagent "github.com/KPO-Tech/seshat/pkg/agent"
)

// ─── Response DTOs ────────────────────────────────────────────────────────────

type agentResponse struct {
	ID              string   `json:"id,omitempty"`
	Slug            string   `json:"slug"`
	Name            string   `json:"name"`
	WhenToUse       string   `json:"when_to_use"`
	SystemPrompt    string   `json:"system_prompt,omitempty"`
	Model           string   `json:"model,omitempty"`
	Tools           []string `json:"tools,omitempty"`
	DisallowedTools []string `json:"disallowed_tools,omitempty"`
	MaxTurns        int      `json:"max_turns"`
	PermissionMode  string   `json:"permission_mode,omitempty"`
	Isolation       string   `json:"isolation,omitempty"`
	McpServers      []string `json:"mcp_servers,omitempty"`
	Icon            string   `json:"icon,omitempty"`
	Enabled         bool     `json:"enabled"`
	Source          string   `json:"source"`
	CreatedAt       int64    `json:"created_at,omitempty"`
	UpdatedAt       int64    `json:"updated_at,omitempty"`
}

func agentToResponse(a backendagents.Agent) agentResponse {
	return agentResponse{
		ID:              a.ID,
		Slug:            a.Slug,
		Name:            a.Name,
		WhenToUse:       a.WhenToUse,
		SystemPrompt:    a.SystemPrompt,
		Model:           a.Model,
		Tools:           a.Tools,
		DisallowedTools: a.DisallowedTools,
		MaxTurns:        a.MaxTurns,
		PermissionMode:  a.PermissionMode,
		Isolation:       a.Isolation,
		McpServers:      a.McpServers,
		Icon:            a.Icon,
		Enabled:         a.Enabled,
		Source:          a.Source,
		CreatedAt:       a.CreatedAt.Unix(),
		UpdatedAt:       a.UpdatedAt.Unix(),
	}
}

// organizationPresetToResponse mirrors builtInToResponse: an organization
// preset (like a built-in) has no per-user CreatedAt/UpdatedAt worth
// showing, so it uses its own converter rather than agentToResponse's
// unconditional a.CreatedAt.Unix() (which would render as a large negative
// number for a zero-value time.Time).
func organizationPresetToResponse(a backendagents.Agent) agentResponse {
	return agentResponse{
		Slug:            a.Slug,
		Name:            a.Name,
		WhenToUse:       a.WhenToUse,
		SystemPrompt:    a.SystemPrompt,
		Model:           a.Model,
		Tools:           a.Tools,
		DisallowedTools: a.DisallowedTools,
		MaxTurns:        a.MaxTurns,
		PermissionMode:  a.PermissionMode,
		Isolation:       a.Isolation,
		McpServers:      a.McpServers,
		Icon:            a.Icon,
		Enabled:         a.Enabled,
		Source:          a.Source,
	}
}

func builtInToResponse(def *pkgagent.AgentDefinition) agentResponse {
	prompt := ""
	if def.GetSystemPrompt != nil {
		prompt = def.GetSystemPrompt()
	}
	return agentResponse{
		Slug:           def.AgentType,
		Name:           def.AgentType,
		WhenToUse:      def.WhenToUse,
		SystemPrompt:   prompt,
		Model:          def.Model,
		Tools:          def.Tools,
		MaxTurns:       def.MaxTurns,
		PermissionMode: string(def.PermissionMode),
		Isolation:      def.Isolation,
		McpServers:     def.McpServers,
		Enabled:        true,
		Source:         string(def.Source),
	}
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// GET  /api/v1/agents        — list all agents (built-ins + user-defined)
// POST /api/v1/agents        — create a user-defined agent
func (a *App) handleAgents(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.handleAgentsList(w, r)
	case http.MethodPost:
		a.handleAgentsCreate(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleAgentsList(w http.ResponseWriter, r *http.Request) {
	var resp []agentResponse

	// Built-in agents first.
	reg := pkgagent.NewAgentRegistry()
	for _, def := range reg.All() {
		resp = append(resp, builtInToResponse(def))
	}

	// User-defined agents from DB (if store is configured).
	if a.backend.Agents != nil {
		custom, err := a.backend.Agents.List(r.Context())
		if err != nil {
			writeBackendError(w, err)
			return
		}
		for _, ag := range custom {
			resp = append(resp, agentToResponse(ag))
		}
	}

	// Additive enrichment: the connected organization's shared preset
	// catalog, if any — see internal/agents.Service.ListOrganizationPresets.
	// Never a hard dependency: any failure (including standalone mode,
	// where this is simply a no-op) just means "nothing to add."
	if a.backend.Agents != nil {
		if principal, ok := authPrincipalFromContext(r.Context()); ok {
			orgPresets, err := a.backend.Agents.ListOrganizationPresets(r.Context(), principal)
			if err == nil {
				for _, ag := range orgPresets {
					resp = append(resp, organizationPresetToResponse(ag))
				}
			}
		}
	}

	if resp == nil {
		resp = []agentResponse{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": resp, "count": len(resp)})
}

func (a *App) handleAgentsCreate(w http.ResponseWriter, r *http.Request) {
	if a.backend.Agents == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "agent store not configured")
		return
	}

	var body struct {
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
		// Source: omit/"" for a normal Companion persona - only the
		// Automation graph's own "agent" node sets "workflow" explicitly
		// (see agents.CreateParams.Source).
		Source string `json:"source"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Slug) == "" {
		writeJSONError(w, http.StatusBadRequest, "slug is required")
		return
	}
	// "built-in"/"organization" are assigned internally (see
	// builtInToResponse/organizationPresetToResponse) - never settable by
	// a caller of this public endpoint.
	if source := strings.TrimSpace(body.Source); source != "" && source != "workflow" {
		writeJSONError(w, http.StatusBadRequest, "source must be empty or \"workflow\"")
		return
	}

	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}

	created, err := a.backend.Agents.Create(r.Context(), backendagents.CreateParams{
		Slug:            body.Slug,
		Name:            body.Name,
		WhenToUse:       body.WhenToUse,
		SystemPrompt:    body.SystemPrompt,
		Model:           body.Model,
		Tools:           body.Tools,
		DisallowedTools: body.DisallowedTools,
		MaxTurns:        body.MaxTurns,
		PermissionMode:  body.PermissionMode,
		Isolation:       body.Isolation,
		McpServers:      body.McpServers,
		Icon:            body.Icon,
		Enabled:         enabled,
		Source:          body.Source,
	})
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, agentToResponse(*created))
}

// GET    /api/v1/agents/{slug}  — get one agent
// PUT    /api/v1/agents/{slug}  — update agent
// DELETE /api/v1/agents/{slug}  — delete agent
func (a *App) handleAgentBySlug(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimPrefix(r.URL.Path, "/agents/")
	slug = strings.Trim(slug, "/")

	switch r.Method {
	case http.MethodGet:
		if a.backend.Agents == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "agent store not configured")
			return
		}
		ag, err := a.backend.Agents.GetBySlug(r.Context(), slug)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, agentToResponse(*ag))

	case http.MethodPut:
		if a.backend.Agents == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "agent store not configured")
			return
		}
		existing, err := a.backend.Agents.GetBySlug(r.Context(), slug)
		if err != nil {
			writeBackendError(w, err)
			return
		}

		var body struct {
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
		if !decodeJSONBody(w, r, &body) {
			return
		}
		updated, err := a.backend.Agents.Update(r.Context(), existing.ID, backendagents.UpdateParams{
			Name:            body.Name,
			WhenToUse:       body.WhenToUse,
			SystemPrompt:    body.SystemPrompt,
			Model:           body.Model,
			Tools:           body.Tools,
			DisallowedTools: body.DisallowedTools,
			MaxTurns:        body.MaxTurns,
			PermissionMode:  body.PermissionMode,
			Isolation:       body.Isolation,
			McpServers:      body.McpServers,
			Icon:            body.Icon,
			Enabled:         body.Enabled,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, agentToResponse(*updated))

	case http.MethodDelete:
		if a.backend.Agents == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "agent store not configured")
			return
		}
		existing, err := a.backend.Agents.GetBySlug(r.Context(), slug)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		if err := a.backend.Agents.Delete(r.Context(), existing.ID); err != nil {
			writeBackendError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
