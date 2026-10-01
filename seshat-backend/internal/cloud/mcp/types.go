// Package cloudmcp fetches an organization's shared MCP server catalog from
// seshat-server, so a connected seshat-backend can offer them to its user
// without the user re-entering the same command/URL/credentials manually.
// Execution never moves to seshat-server — this is config only, mirroring
// the split already used for provider settings/web search (see
// helps/seshat-architecture-target.md, "MCP config"). A server in this
// catalog is never auto-loaded: the local user must explicitly approve
// each one first (see internal/mcp.Service.ApproveOrgServer), since a
// stdio-type server spawns an arbitrary command on the user's own machine.
package cloudmcp

// ServerConfig mirrors seshat-server's mcpregistry.ResolvedMCPServerConfig
// — includes decrypted env/headers, since the point of resolving is to
// actually load the server (once approved), not just display it.
type ServerConfig struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	DisplayName string            `json:"display_name,omitempty"`
	ServerType  string            `json:"server_type"`
	Command     string            `json:"command,omitempty"`
	Args        []string          `json:"args,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	URL         string            `json:"url,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	TimeoutSecs int               `json:"timeout_secs"`
	Icon        string            `json:"icon,omitempty"`
}

type resolveResponse struct {
	MCPServerConfigs []ServerConfig `json:"mcp_server_configs"`
}

// AdminServerConfig mirrors seshat-server's mcpregistry.MCPServerConfig -
// the caller-facing admin-list shape, deliberately distinct from
// ServerConfig above: it never carries Env/Headers (encrypted secrets) at
// all, only whether the server is configured, plus ConnectorKind. Backs
// Admin Console's own MCP Servers tab, the desktop-app counterpart of
// seshat-console's MCPServersPage.tsx.
type AdminServerConfig struct {
	ID              string   `json:"id"`
	OrganizationID  string   `json:"organization_id"`
	CreatedByUserID string   `json:"created_by_user_id"`
	Name            string   `json:"name"`
	DisplayName     string   `json:"display_name,omitempty"`
	ServerType      string   `json:"server_type"`
	Command         string   `json:"command,omitempty"`
	Args            []string `json:"args,omitempty"`
	URL             string   `json:"url,omitempty"`
	TimeoutSecs     int      `json:"timeout_secs"`
	Icon            string   `json:"icon,omitempty"`
	ConnectorKind   string   `json:"connector_kind,omitempty"`
}

type adminListResponse struct {
	MCPServerConfigs []AdminServerConfig `json:"mcp_server_configs"`
}
