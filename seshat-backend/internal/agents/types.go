package agents

import "time"

// Agent is the domain view of a user-defined agent definition.
type Agent struct {
	ID              string
	Slug            string   // unique identifier used as AgentType in the SDK registry
	Name            string   // human-readable display name
	WhenToUse       string   // description of when to delegate to this agent
	SystemPrompt    string   // full system prompt (replaces or extends the engine default)
	Model           string   // optional model override
	Tools           []string // allowed tool name patterns (nil = all tools)
	DisallowedTools []string
	MaxTurns        int
	PermissionMode  string
	Isolation       string
	McpServers      []string
	Icon            string
	Enabled         bool
	Source          string // "user" (default) or "workflow" for DB agents, "built-in" for engine defaults, "organization" for org catalog presets
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type CreateParams struct {
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
	Enabled         bool
	// Source: "" (defaults to "user") for a normal Companion persona,
	// "workflow" for one created inline by an Automation graph's own
	// "agent" node - see Service.List, which excludes "workflow" rows so
	// they don't show up in Companion's own picker.
	Source string
}

type UpdateParams struct {
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
