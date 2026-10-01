package cloudhooks

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	cloudhttp "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's hook registry
// endpoint - same convention as cloudmcp.Client: no fixed token, each call
// takes the caller's own session token explicitly.
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

// ResolveHookConfigs returns every enabled hook the organization has
// shared. Callers should treat any error as "no org hooks this reload" -
// this is enrichment, never a hard dependency.
func (c *Client) ResolveHookConfigs(ctx context.Context, token, organizationID string) ([]HookConfig, error) {
	q := url.Values{"organization_id": {organizationID}}
	var result resolveResponse
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/hook-configs/resolve?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return result.HookConfigs, nil
}
