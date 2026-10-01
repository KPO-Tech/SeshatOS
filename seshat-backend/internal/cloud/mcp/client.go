package cloudmcp

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's MCP registry
// endpoint — same convention as cloudwebsearch.Client/cloudskillregistry.Client:
// no fixed token, each call takes the caller's own session token explicitly.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

// ResolveServerConfigs returns every MCP server config the organization has
// shared, with env/headers decrypted. Callers should treat any error as
// "nothing to add" and fall back to the local catalog alone — this is an
// enrichment, never a hard dependency.
func (c *Client) ResolveServerConfigs(ctx context.Context, token, organizationID string) ([]ServerConfig, error) {
	q := url.Values{"organization_id": {organizationID}}
	var result resolveResponse
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/mcp-server-configs/resolve?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return result.MCPServerConfigs, nil
}

// ─── Admin CRUD (organization-wide, seshat-backend's own Admin Console) ────
//
// Unlike ResolveServerConfigs above (any org member, includes decrypted
// env/headers, for actually loading a server locally once approved), these
// hit seshat-server's real mcpregistry CRUD endpoints directly - the exact
// same ones seshat-console's MCPServersPage.tsx already writes through.
// seshat-server's own mcp_registry.manage permission check is what actually
// authorizes these; the caller (internal/api's admin handlers) also checks
// auth.EnsureAdmin locally first as defense in depth, mirroring
// cloudsettings.Client's own admin methods.

func (c *Client) ListServerConfigs(ctx context.Context, token, organizationID string) ([]AdminServerConfig, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload adminListResponse
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/mcp-server-configs?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.MCPServerConfigs, nil
}

type CreateServerConfigParams struct {
	OrganizationID, Name, DisplayName, ServerType, Command string
	Args                                                   []string
	Env                                                    map[string]string
	URL                                                    string
	Headers                                                map[string]string
	TimeoutSecs                                            int
	Icon                                                   string
	ConnectorKind                                          string
}

func (c *Client) CreateServerConfig(ctx context.Context, token string, params CreateServerConfigParams) (*AdminServerConfig, error) {
	var config AdminServerConfig
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"name":            params.Name,
		"display_name":    params.DisplayName,
		"server_type":     params.ServerType,
		"command":         params.Command,
		"args":            params.Args,
		"env":             params.Env,
		"url":             params.URL,
		"headers":         params.Headers,
		"timeout_secs":    params.TimeoutSecs,
		"icon":            params.Icon,
		"connector_kind":  params.ConnectorKind,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/mcp-server-configs", token, body, &config); err != nil {
		return nil, err
	}
	return &config, nil
}

type UpdateServerConfigParams struct {
	DisplayName, ServerType, Command string
	Args                             []string
	Env                              map[string]string
	URL                              string
	Headers                          map[string]string
	TimeoutSecs                      int
	Icon                             string
	ConnectorKind                    string
}

func (c *Client) UpdateServerConfig(ctx context.Context, token, id string, params UpdateServerConfigParams) (*AdminServerConfig, error) {
	var config AdminServerConfig
	body := map[string]any{
		"display_name":   params.DisplayName,
		"server_type":    params.ServerType,
		"command":        params.Command,
		"args":           params.Args,
		"env":            params.Env,
		"url":            params.URL,
		"headers":        params.Headers,
		"timeout_secs":   params.TimeoutSecs,
		"icon":           params.Icon,
		"connector_kind": params.ConnectorKind,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/mcp-server-configs/"+url.PathEscape(id), token, body, &config); err != nil {
		return nil, err
	}
	return &config, nil
}

func (c *Client) DeleteServerConfig(ctx context.Context, token, id string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.serverURL+"/api/v1/mcp-server-configs/"+url.PathEscape(id), token, nil, nil)
	return err
}
