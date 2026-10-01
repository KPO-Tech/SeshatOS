package cloudknowledge

import (
	"context"
	"net/http"
	"net/url"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// OrgEmbedderSetting mirrors seshat-server's knowledge.EmbedderSetting - a
// singleton per organization (at most one row), never carrying the API key
// back to the caller. This is a clean swap of the SAME "Knowledge" tab's
// embedder card, exactly like corpora above (see this package's own doc
// comment) - NOT a personal-vs-org duality like Providers/Web Search: there
// is no separate "my own embedder" concept, only "this device's config"
// which becomes "the organization's config" once connected. See
// docs/helps/... "Admin Console" architecture item - this used to always
// stay local (db.EmbedderConfigStore) even when connected, silently
// duplicating seshat-server's real org-wide setting instead of reading it.
type OrgEmbedderSetting struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	Provider       string `json:"provider"`
	Model          string `json:"model"`
	BaseURL        string `json:"base_url"`
}

// GetOrgEmbedderSetting calls GET /api/v1/embedder-settings. Returns
// (nil, nil) when the organization has none configured yet - mirroring
// db.EmbedderConfigStore.Get's own "no row = nil, no error" convention, so
// callers don't need to special-case connected vs standalone.
func (c *Client) GetOrgEmbedderSetting(ctx context.Context, token, organizationID string) (*OrgEmbedderSetting, error) {
	q := url.Values{"organization_id": {organizationID}}
	var setting OrgEmbedderSetting
	status, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/embedder-settings?"+q.Encode(), token, nil, &setting)
	if status == http.StatusNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &setting, nil
}

// SetOrgEmbedderSettingParams — APIKey empty means "no key" on first create
// (valid for an unauthenticated local Ollama) and "keep the existing key
// unchanged" when a setting already exists, matching seshat-server's own
// SetEmbedderSettingParams semantics exactly.
type SetOrgEmbedderSettingParams struct {
	OrganizationID string
	Provider       string
	Model          string
	BaseURL        string
	APIKey         string
}

func (c *Client) SetOrgEmbedderSetting(ctx context.Context, token string, params SetOrgEmbedderSettingParams) (*OrgEmbedderSetting, error) {
	var setting OrgEmbedderSetting
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"provider":        params.Provider,
		"model":           params.Model,
		"base_url":        params.BaseURL,
		"api_key":         params.APIKey,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/embedder-settings", token, body, &setting); err != nil {
		return nil, err
	}
	return &setting, nil
}
