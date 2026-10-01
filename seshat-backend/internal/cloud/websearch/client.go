package cloudwebsearch

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's web-search
// settings endpoints — same convention as cloudsettings.Client/
// cloudskillregistry.Client: no fixed token, each call takes the caller's
// own session token explicitly. Timeouts are kept short since these calls
// enrich a per-request resolution chain and must never noticeably slow it
// down; callers should treat any error as "nothing to add" here.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 3 * time.Second},
	}
}

// ResolveProviderSetting resolves the effective web-search provider config
// for organizationID/provider (org setting wins, else the platform
// default). A 404 (nothing configured anywhere for this provider) is a
// normal outcome, not logged as an error by callers.
func (c *Client) ResolveProviderSetting(ctx context.Context, token, organizationID, provider string) (*ResolvedProviderSetting, error) {
	q := url.Values{"organization_id": {organizationID}, "provider": {provider}}
	var result ResolvedProviderSetting
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/web-search-provider-settings/resolve?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetOrgPolicy fetches the organization's web-search domain policy. An
// organization that never set one still returns 200 with empty lists (see
// seshat-server's GetOrgPolicy), so a non-nil result with empty slices is
// the normal "no policy set" case, not an error.
func (c *Client) GetOrgPolicy(ctx context.Context, token, organizationID string) (*OrgPolicy, error) {
	q := url.Values{"organization_id": {organizationID}}
	var result OrgPolicy
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/web-search-org-policy?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// UpsertOrgPolicyParams is Admin Console's write path for the organization's
// web-search domain policy - see internal/api/admin_web_search.go. Unlike
// provider settings, there is no org-wide web-search "provider" concept at
// all on seshat-server (every web-search provider credential is always
// personal, per user - see websearch.Service.UpsertProvider); the domain
// policy is the only thing an admin can configure here.
type UpsertOrgPolicyParams struct {
	OrganizationID string
	AllowedDomains []string
	BlockedDomains []string
}

func (c *Client) UpsertOrgPolicy(ctx context.Context, token string, params UpsertOrgPolicyParams) (*OrgPolicy, error) {
	var result OrgPolicy
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"allowed_domains": params.AllowedDomains,
		"blocked_domains": params.BlockedDomains,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/web-search-org-policy", token, body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
