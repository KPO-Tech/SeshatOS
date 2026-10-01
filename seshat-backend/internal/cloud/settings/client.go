package cloudsettings

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's provider-settings
// endpoints — same convention as cloudidentity.Client: no fixed token, each
// call takes the caller's own session token explicitly.
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

// ResolveProviderSetting calls GET /api/v1/provider-settings/resolve — the
// only endpoint in this domain that returns a decrypted, usable API key.
func (c *Client) ResolveProviderSetting(ctx context.Context, token, organizationID, provider string) (*ResolvedProviderSetting, error) {
	q := url.Values{"organization_id": {organizationID}, "provider": {provider}}
	var result ResolvedProviderSetting
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/provider-settings/resolve?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ListUsableProviderSettings calls the member-safe picker endpoint. Unlike the
// admin CRUD list, this exposes only settings the caller can actually use and
// never includes API keys.
func (c *Client) ListUsableProviderSettings(ctx context.Context, token, organizationID string) ([]OrgProviderSetting, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		ProviderSettings []OrgProviderSetting `json:"provider_settings"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/provider-settings/usable?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.ProviderSettings, nil
}

// ─── Admin CRUD (organization-wide, seshat-backend's own Admin Console) ────────
//
// Unlike ResolveProviderSetting above (any org member, read-only, decrypted
// key for local use), these hit seshat-server's real
// automation.ProviderSetting CRUD endpoints directly — the exact same ones
// seshat-console's ProviderSettingsPage.tsx already writes through.
// seshat-server's own provider_settings.manage permission check is what
// actually authorizes these; the caller (internal/api's admin handlers) also
// checks auth.EnsureAdmin locally first as defense in depth, mirroring
// cloudidentity.Provider's Users methods.

func (c *Client) ListOrgProviderSettings(ctx context.Context, token, organizationID string) ([]OrgProviderSetting, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		ProviderSettings []OrgProviderSetting `json:"provider_settings"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/provider-settings?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.ProviderSettings, nil
}

type CreateOrgProviderSettingParams struct {
	OrganizationID string
	Provider       string
	DefaultModel   string
	BaseURL        string
	APIKey         string
}

func (c *Client) CreateOrgProviderSetting(ctx context.Context, token string, params CreateOrgProviderSettingParams) (*OrgProviderSetting, error) {
	var setting OrgProviderSetting
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"provider":        params.Provider,
		"default_model":   params.DefaultModel,
		"base_url":        params.BaseURL,
		"api_key":         params.APIKey,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/provider-settings", token, body, &setting); err != nil {
		return nil, err
	}
	return &setting, nil
}

type UpdateOrgProviderSettingParams struct {
	DefaultModel string
	BaseURL      string
	// APIKey empty means "keep the existing key" - matches
	// automation.UpdateProviderSettingParams' own convention.
	APIKey string
}

func (c *Client) UpdateOrgProviderSetting(ctx context.Context, token, id string, params UpdateOrgProviderSettingParams) (*OrgProviderSetting, error) {
	var setting OrgProviderSetting
	body := map[string]any{
		"default_model": params.DefaultModel,
		"base_url":      params.BaseURL,
		"api_key":       params.APIKey,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/provider-settings/"+id, token, body, &setting); err != nil {
		return nil, err
	}
	return &setting, nil
}

func (c *Client) DeleteOrgProviderSetting(ctx context.Context, token, id string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.serverURL+"/api/v1/provider-settings/"+id, token, nil, nil)
	return err
}

func (c *Client) SetOrgProviderSettingDefault(ctx context.Context, token, id string, isDefault bool) (*OrgProviderSetting, error) {
	path := "/set-default"
	if !isDefault {
		path = "/unset-default"
	}
	var setting OrgProviderSetting
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/provider-settings/"+id+path, token, nil, &setting); err != nil {
		return nil, err
	}
	return &setting, nil
}
