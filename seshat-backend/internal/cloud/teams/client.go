// Package cloudteams lets seshat-backend manage an organization's real
// Teams (seshat-server's iam.Group) for Admin Console's Teams tab. This
// replaced the old local Group/GroupPermissions system (a per-device
// feature-permission bundle with no organization concept at all) - Teams are
// a genuinely different thing: an organization-wide, SCIM-syncable subject
// for policy assignment, with no permissions of its own. See
// docs/helps/... "Admin Console" architecture item.
package cloudteams

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// OrgTeam mirrors seshat-server's iam.Group.
type OrgTeam struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	Description    string    `json:"description"`
	MemberUserIDs  []string  `json:"member_user_ids"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	ScimExternalID *string   `json:"scim_external_id,omitempty"`
}

type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) ListOrgTeams(ctx context.Context, token, organizationID string) ([]OrgTeam, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		Groups []OrgTeam `json:"groups"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/groups?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Groups, nil
}

type CreateOrgTeamParams struct {
	OrganizationID string
	Name           string
	Slug           string
	Description    string
	MemberUserIDs  []string
}

func (c *Client) CreateOrgTeam(ctx context.Context, token string, params CreateOrgTeamParams) (*OrgTeam, error) {
	var team OrgTeam
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"name":            params.Name,
		"slug":            params.Slug,
		"description":     params.Description,
		"member_user_ids": params.MemberUserIDs,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/groups", token, body, &team); err != nil {
		return nil, err
	}
	return &team, nil
}

type UpdateOrgTeamParams struct {
	Name          string
	Slug          string
	Description   string
	MemberUserIDs []string
}

func (c *Client) UpdateOrgTeam(ctx context.Context, token, id string, params UpdateOrgTeamParams) (*OrgTeam, error) {
	var team OrgTeam
	body := map[string]any{
		"name":            params.Name,
		"slug":            params.Slug,
		"description":     params.Description,
		"member_user_ids": params.MemberUserIDs,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/groups/"+id, token, body, &team); err != nil {
		return nil, err
	}
	return &team, nil
}

func (c *Client) DeleteOrgTeam(ctx context.Context, token, id string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.serverURL+"/api/v1/groups/"+id, token, nil, nil)
	return err
}
