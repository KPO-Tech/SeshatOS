package cloudagents

import (
	"context"
	"net/http"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// ─── Admin CRUD (organization-wide, seshat-backend's own Admin Console) ────
//
// Unlike ListPresets above (any org member, read-only, used to enrich local
// agent resolution), these hit seshat-server's real agentregistry.AgentPreset
// CRUD endpoints directly - the exact same ones seshat-console's
// AgentPresetsPage.tsx already writes through.

type CreatePresetParams struct {
	OrganizationID  string
	Slug            string
	Name            string
	WhenToUse       string
	SystemPrompt    string
	Model           string
	Tools           []string
	DisallowedTools []string
	MaxTurns        int
	PermissionMode  string
	Isolation       string
	McpServers      []string
	Icon            string
	Enabled         *bool
}

func (c *Client) CreatePreset(ctx context.Context, token string, params CreatePresetParams) (*AgentPreset, error) {
	var preset AgentPreset
	body := map[string]any{
		"organization_id":  params.OrganizationID,
		"slug":             params.Slug,
		"name":             params.Name,
		"when_to_use":      params.WhenToUse,
		"system_prompt":    params.SystemPrompt,
		"model":            params.Model,
		"tools":            params.Tools,
		"disallowed_tools": params.DisallowedTools,
		"max_turns":        params.MaxTurns,
		"permission_mode":  params.PermissionMode,
		"isolation":        params.Isolation,
		"mcp_servers":      params.McpServers,
		"icon":             params.Icon,
		"enabled":          params.Enabled,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/agent-presets", token, body, &preset); err != nil {
		return nil, err
	}
	return &preset, nil
}

type UpdatePresetParams struct {
	Name            *string
	WhenToUse       *string
	SystemPrompt    *string
	Model           *string
	Tools           []string
	DisallowedTools []string
	MaxTurns        *int
	PermissionMode  *string
	Isolation       *string
	McpServers      []string
	Icon            *string
	Enabled         *bool
}

func (c *Client) UpdatePreset(ctx context.Context, token, id string, params UpdatePresetParams) (*AgentPreset, error) {
	var preset AgentPreset
	body := map[string]any{
		"name":             params.Name,
		"when_to_use":      params.WhenToUse,
		"system_prompt":    params.SystemPrompt,
		"model":            params.Model,
		"tools":            params.Tools,
		"disallowed_tools": params.DisallowedTools,
		"max_turns":        params.MaxTurns,
		"permission_mode":  params.PermissionMode,
		"isolation":        params.Isolation,
		"mcp_servers":      params.McpServers,
		"icon":             params.Icon,
		"enabled":          params.Enabled,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/agent-presets/"+id, token, body, &preset); err != nil {
		return nil, err
	}
	return &preset, nil
}

func (c *Client) DeletePreset(ctx context.Context, token, id string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.serverURL+"/api/v1/agent-presets/"+id, token, nil, nil)
	return err
}
