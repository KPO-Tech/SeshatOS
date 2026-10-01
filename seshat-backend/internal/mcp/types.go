package mcp

import (
	"time"

	enginemcp "github.com/KPO-Tech/seshat/pkg/mcp"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

type Server struct {
	ID          string
	Name        string
	DisplayName string
	ServerType  string
	Command     string
	Args        []string
	Env         map[string]string
	URL         string
	Headers     map[string]string
	TimeoutSecs int
	Icon        string
	Enabled     bool
	Source      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// ToSDKConfig converts the domain Server to the SDK wire type used by the runtime.
func (s Server) ToSDKConfig() sdk.MCPServerConfig {
	return sdk.MCPServerConfig{
		Name:      s.Name,
		Command:   s.Command,
		Args:      s.Args,
		URL:       s.URL,
		Transport: enginemcp.TransportType(s.ServerType),
		Env:       s.Env,
		Headers:   s.Headers,
		Timeout:   time.Duration(s.TimeoutSecs) * time.Second,
	}
}

// ServerStatus is the runtime connection status for one MCP server.
type ServerStatus struct {
	Name  string
	OK    bool
	Error string // empty when OK
	Tools int
	// Source is "organization" when this server was loaded from a
	// connected seshat-server's shared catalog (once approved locally)
	// rather than the local mcp_servers table; empty otherwise.
	Source string
}

// OrgServerStatus is one entry from the connected org's MCP catalog, cross
// referenced with this installation's local approval state.
type OrgServerStatus struct {
	ID          string
	Name        string
	DisplayName string
	ServerType  string
	Command     string
	Args        []string
	URL         string
	Icon        string
	Approved    bool
}

// ToolInfo holds the name and description of a single connected MCP tool.
type ToolInfo struct {
	Name        string
	Description string
}

type CreateParams struct {
	Name        string
	DisplayName string
	ServerType  string
	Command     string
	Args        []string
	Env         map[string]string
	URL         string
	Headers     map[string]string
	TimeoutSecs int
	Icon        string
	Enabled     bool
}

type UpdateParams struct {
	DisplayName *string
	ServerType  *string
	Command     *string
	Args        []string
	Env         map[string]string
	URL         *string
	Headers     map[string]string
	TimeoutSecs *int
	Icon        *string
	Enabled     *bool
}
