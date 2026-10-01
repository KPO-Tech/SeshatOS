// Package action implements connector.ActionConnector by delegating Act
// to a direct MCP tool call - the first real implementation of the
// ActionConnector contract posed (but never implemented) in Phase 1 of
// helps/roadmap.md. Generic Knowledge/Action-registry MCP support already
// lets any MCP server's tools reach an agent's tool registry with zero
// code (see helps/audit-2026-08-13-enterprise-readiness.md's "Couche 1 —
// déjà complet" verdict); what didn't exist is a deterministic, app-driven
// call to a specific tool outside that LLM-mediated path, which is what
// ActionConnector.Act needs.
package action

import (
	"context"
	"fmt"
	"strings"
	"time"

	sdkmcp "github.com/KPO-Tech/seshat/pkg/mcp"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// Connector implements connector.ActionConnector by connecting to one
// specific, already-configured MCP server (resolved by name via
// MCPServerStore, the same generic store the Settings > MCP UI already
// writes to - see internal/db/mcp_servers.go) and calling the requested
// tool directly. Not hardcoded to any one target: NewConnector can wrap any
// MCP server already registered, the demo CRM server (cmd/demo-crm-mcp) is
// simply the first concrete instance wired up.
type Connector struct {
	store      *db.MCPServerStore
	serverName string
}

// NewConnector builds an ActionConnector bound to the MCP server registered
// under serverName. Resolution happens per-call (Act), not here, so a
// server registered after this Connector is constructed still works.
func NewConnector(store *db.MCPServerStore, serverName string) *Connector {
	return &Connector{store: store, serverName: strings.TrimSpace(serverName)}
}

func (c *Connector) Kind() connector.Kind {
	return connector.Kind("mcp:" + c.serverName)
}

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityAction}
}

// Act connects to the target MCP server and calls the tool named action
// with payload as its arguments. secret.AccessToken, when set, is injected
// as an Authorization: Bearer header on top of the server's own static
// config - this is what makes secret meaningful for an MCP-backed
// connector: MCPServerStore holds one shared config per server, but a
// specific connected account's own credential must not be assumed to be
// baked into that shared config. A connect/call error is a Go error (the
// operation could not even be attempted); a successful call that the
// target tool itself reports as failed is not - see resultFromCallTool.
func (c *Connector) Act(ctx context.Context, account connector.Account, secret connector.Secret, action string, payload map[string]any) (connector.ActionResult, error) {
	_ = account
	if strings.TrimSpace(action) == "" {
		return connector.ActionResult{}, fmt.Errorf("action is required")
	}

	server, found, err := c.store.GetByName(ctx, c.serverName)
	if err != nil {
		return connector.ActionResult{}, fmt.Errorf("resolve mcp server %q: %w", c.serverName, err)
	}
	if !found {
		return connector.ActionResult{}, fmt.Errorf("mcp server %q is not configured", c.serverName)
	}

	config := sdkmcp.ServerConfig{
		Name:      server.Name,
		Command:   server.Command,
		Args:      server.Args,
		URL:       server.URL,
		Transport: sdkmcp.TransportType(server.ServerType),
		Env:       server.Env,
		Headers:   server.Headers,
		Timeout:   time.Duration(server.TimeoutSecs) * time.Second,
	}
	if secret.AccessToken != "" {
		headers := make(map[string]string, len(config.Headers)+1)
		for k, v := range config.Headers {
			headers[k] = v
		}
		headers["Authorization"] = "Bearer " + secret.AccessToken
		config.Headers = headers
	}

	client, err := sdkmcp.NewClient(config)
	if err != nil {
		return connector.ActionResult{}, fmt.Errorf("create mcp client for %q: %w", c.serverName, err)
	}
	defer client.Close()

	if err := client.Start(ctx); err != nil {
		return connector.ActionResult{}, fmt.Errorf("start mcp client for %q: %w", c.serverName, err)
	}
	if _, err := client.Initialize(ctx); err != nil {
		return connector.ActionResult{}, fmt.Errorf("initialize mcp client for %q: %w", c.serverName, err)
	}

	result, err := client.CallTool(ctx, action, payload)
	if err != nil {
		// A tool call the server itself rejected (unknown tool, bad
		// arguments) is a normal, expected outcome for a caller to handle -
		// not a connector-level failure. Reported via ActionResult, not a
		// Go error, matching the contract's own Success field.
		return connector.ActionResult{Success: false, Message: err.Error()}, nil
	}
	return connector.ActionResult{Success: true, Data: result}, nil
}
