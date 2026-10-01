package cloudconnectors

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's connector
// OAuth app registry endpoints - same convention as cloudsettings.Client/
// cloudmcp.Client: no fixed token, each call takes the caller's own session
// token explicitly. Backs Admin Console's own Connectors tab only - hits
// seshat-server's real connectors.Service.ListOAuthApps/RegisterOAuthApp
// directly, the exact same ones seshat-console's ConnectorsPage.tsx OAuth
// Apps modal already writes through, so a change from either place is
// immediately visible in the other.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) ListOAuthApps(ctx context.Context, token, organizationID string) ([]OAuthApp, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		OAuthApps []OAuthApp `json:"oauth_apps"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/connectors/oauth-apps?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.OAuthApps, nil
}

type RegisterOAuthAppParams struct {
	OrganizationID string
	Kind           string
	ClientID       string
	// ClientSecret empty on an update to an already-registered app means
	// "keep the existing one" - matches connectors.RegisterOAuthAppParams'
	// own convention.
	ClientSecret string
	// Subdomain is required for kind "zendesk" only, rejected for every
	// other kind - see connectors.zendeskKind's doc comment.
	Subdomain string
}

// RegisterOAuthApp is an upsert: PUT /api/v1/connectors/oauth-apps/{kind}
// creates the app on first call, updates it in place on later calls.
func (c *Client) RegisterOAuthApp(ctx context.Context, token string, params RegisterOAuthAppParams) (*OAuthApp, error) {
	var app OAuthApp
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"client_id":       params.ClientID,
		"client_secret":   params.ClientSecret,
		"subdomain":       params.Subdomain,
	}
	requestURL := c.serverURL + "/api/v1/connectors/oauth-apps/" + url.PathEscape(params.Kind)
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, requestURL, token, body, &app); err != nil {
		return nil, err
	}
	return &app, nil
}

// ─── Self-service connections ("Workspace → Connections") ───────────────
//
// Distinct from the OAuth-app-registry methods above: those back Admin
// Console's org-wide "bring your own OAuth app" registration step; these
// back any employee's own per-account connect/disconnect against whichever
// app the organization already registered - the exact same
// connectors.Service.{ListMyAccounts,BeginConnectorOAuth(agent_action),
// CreateStaticAgentAccount,DeleteMyAccount} methods seshat-server already
// exposes and tests, just not yet reachable through this desktop backend.

// ListMyAccounts lists the calling employee's own connected accounts -
// GET /api/v1/connectors/my-accounts.
func (c *Client) ListMyAccounts(ctx context.Context, token, organizationID string) ([]ConnectorAccount, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		ConnectorAccounts []ConnectorAccount `json:"connector_accounts"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/connectors/my-accounts?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.ConnectorAccounts, nil
}

// DeleteMyAccount disconnects one of the calling employee's own accounts -
// DELETE /api/v1/connectors/my-accounts/{accountID}.
func (c *Client) DeleteMyAccount(ctx context.Context, token, accountID string) error {
	requestURL := c.serverURL + "/api/v1/connectors/my-accounts/" + url.PathEscape(accountID)
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, requestURL, token, nil, nil)
	return err
}

type BeginOAuthParams struct {
	OrganizationID string
	Kind           string
	// Purpose is always "agent_action" for this self-service flow - see
	// connectors.PurposeAgentAction on the seshat-server side.
	Purpose     string
	DisplayName string
}

// BeginOAuth starts a self-service "connect my own account" OAuth flow for
// kind, returning the URL to open in the OS browser -
// POST /api/v1/connectors/{kind}/oauth/start.
func (c *Client) BeginOAuth(ctx context.Context, token string, params BeginOAuthParams) (string, error) {
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"purpose":         params.Purpose,
		"display_name":    params.DisplayName,
	}
	var payload struct {
		AuthorizationURL string `json:"authorization_url"`
	}
	requestURL := c.serverURL + "/api/v1/connectors/" + url.PathEscape(params.Kind) + "/oauth/start"
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, requestURL, token, body, &payload); err != nil {
		return "", err
	}
	return payload.AuthorizationURL, nil
}

type CreateStaticAccountParams struct {
	OrganizationID string
	Kind           string
	DisplayName    string
	Secret         string
}

// CreateStaticAccount connects a static-secret kind (Stripe, SendGrid, ...)
// with a pasted API key, no redirect - POST
// /api/v1/connectors/{kind}/static-account.
func (c *Client) CreateStaticAccount(ctx context.Context, token string, params CreateStaticAccountParams) (*ConnectorAccount, error) {
	var account ConnectorAccount
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"display_name":    params.DisplayName,
		"secret":          params.Secret,
	}
	requestURL := c.serverURL + "/api/v1/connectors/" + url.PathEscape(params.Kind) + "/static-account"
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, requestURL, token, body, &account); err != nil {
		return nil, err
	}
	return &account, nil
}
