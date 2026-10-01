// Package cloudagents fetches an organization's shared agent-preset catalog
// from seshat-server, to enrich seshat-backend's own local agent resolution
// (internal/agents.Service). Like internal/cloudskillregistry, this is
// purely additive — the local agent_definitions table and the SDK's
// built-in registry stay authoritative; the org catalog is one more source
// resolved at query time, never a Provider that replaces anything (see
// helps/seshat-architecture-target.md §7, "Agents registry").
package cloudagents

import "time"

// AgentPreset mirrors seshat-server's agentregistry.AgentPreset. ID/
// OrganizationID/CreatedByUserID/timestamps are only populated when this
// struct is used for admin CRUD (see admin_client.go) - the read-only
// enrichment path (ListPresets, used by internal/agents.Service to resolve
// agents at query time) never needed them and still doesn't care about them.
type AgentPreset struct {
	ID              string    `json:"id,omitempty"`
	OrganizationID  string    `json:"organization_id,omitempty"`
	CreatedByUserID string    `json:"created_by_user_id,omitempty"`
	Slug            string    `json:"slug"`
	Name            string    `json:"name"`
	WhenToUse       string    `json:"when_to_use"`
	SystemPrompt    string    `json:"system_prompt"`
	Model           string    `json:"model,omitempty"`
	Tools           []string  `json:"tools,omitempty"`
	DisallowedTools []string  `json:"disallowed_tools,omitempty"`
	MaxTurns        int       `json:"max_turns"`
	PermissionMode  string    `json:"permission_mode,omitempty"`
	Isolation       string    `json:"isolation,omitempty"`
	McpServers      []string  `json:"mcp_servers,omitempty"`
	Icon            string    `json:"icon,omitempty"`
	Enabled         bool      `json:"enabled"`
	CreatedAt       time.Time `json:"created_at,omitempty"`
	UpdatedAt       time.Time `json:"updated_at,omitempty"`
}

type listResponse struct {
	AgentPresets []AgentPreset `json:"agent_presets"`
}
