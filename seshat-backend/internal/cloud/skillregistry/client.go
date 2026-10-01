package cloudskillregistry

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's skill-repos
// registry endpoint — same convention as cloudsettings.Client/
// cloudpreferences.Client: no fixed token, each call takes the caller's own
// session token explicitly.
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

// ListSkillRepos returns the organization's curated skill repos. Callers
// should treat any error as "nothing to add" and fall back to the local
// catalog alone — this is an enrichment, never a hard dependency.
func (c *Client) ListSkillRepos(ctx context.Context, token, organizationID string) ([]SkillRepo, error) {
	q := url.Values{"organization_id": {organizationID}}
	var result listResponse
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/skill-repos?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return result.SkillRepos, nil
}
