package cloudagents

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's agent-presets
// registry endpoint — same convention as cloudskillregistry.Client: no fixed
// token, each call takes the caller's own session token explicitly.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// ListPresets returns the organization's shared agent presets. Callers
// should treat any error as "nothing to add" and fall back to the local
// catalog/built-in registry alone — this is an enrichment, never a hard
// dependency.
func (c *Client) ListPresets(ctx context.Context, token, organizationID string) ([]AgentPreset, error) {
	q := url.Values{"organization_id": {organizationID}}
	var result listResponse
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/agent-presets?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return result.AgentPresets, nil
}
