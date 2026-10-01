// Package cloudmemberships lets seshat-backend manage an organization's real
// memberships (seshat-server's iam.Membership) for Admin Console's Users
// tab. Deliberately NOT built on seshat-server's /api/v1/users - that
// resource is platform-wide and its iam.Service.ListUsers/CreateUser/
// UpdateUser/DeleteUser all require principal.User.IsAdmin, the rare
// platform super-admin seeded once at server boot (see
// seshat-server/internal/server/iam/users_admin.go's UpdateUserParams doc
// comment) - NOT the same thing as an organization's own "admin" role
// member. A normal org admin (principal.HasRole("admin") on seshat-backend,
// from their own org membership) gets a 403 from every one of those. This
// package instead targets /api/v1/memberships, an org-scoped resource
// gated by "members.manage"/"organization.manage" - the same permission
// codes a real org admin actually holds, and the exact resource
// seshat-console's MembershipsPage.tsx already edits.
package cloudmemberships

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// OrgMembership mirrors seshat-server's iam.Membership.
type OrgMembership struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	OrganizationID  string     `json:"organization_id"`
	Role            string     `json:"role"`
	Status          string     `json:"status"`
	PendingSince    *time.Time `json:"pending_since,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	Permissions     []string   `json:"permissions,omitempty"`
	UserEmail       string     `json:"user_email,omitempty"`
	UserDisplayName string     `json:"user_display_name,omitempty"`
	UserIsAdmin     bool       `json:"user_is_admin,omitempty"`
	ScimExternalID  *string    `json:"scim_external_id,omitempty"`
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

func (c *Client) ListOrgMemberships(ctx context.Context, token, organizationID string) ([]OrgMembership, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		Memberships []OrgMembership `json:"memberships"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/memberships?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Memberships, nil
}

// CreateOrgMemberDirectParams — POST /api/v1/memberships/direct: creates a
// brand-new platform account AND its membership in one step. No password
// field: the new member is emailed a link to set their own.
type CreateOrgMemberDirectParams struct {
	OrganizationID string
	Email          string
	DisplayName    string
	Role           string
}

func (c *Client) CreateOrgMemberDirect(ctx context.Context, token string, params CreateOrgMemberDirectParams) (*OrgMembership, error) {
	var membership OrgMembership
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"email":           params.Email,
		"display_name":    params.DisplayName,
		"role":            params.Role,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/memberships/direct", token, body, &membership); err != nil {
		return nil, err
	}
	return &membership, nil
}

func (c *Client) UpdateOrgMembershipRole(ctx context.Context, token, membershipID, role string) (*OrgMembership, error) {
	var membership OrgMembership
	body := map[string]any{"role": role}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/memberships/"+membershipID, token, body, &membership); err != nil {
		return nil, err
	}
	return &membership, nil
}

func (c *Client) DeleteOrgMembership(ctx context.Context, token, membershipID string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.serverURL+"/api/v1/memberships/"+membershipID, token, nil, nil)
	return err
}

// ListOrgRoles calls GET /api/v1/roles - the built-in + custom role catalog
// for this organization (e.g. "member"/"admin" plus anything an admin has
// defined via seshat-console's Roles page, such as job-title-shaped roles).
// Used only to populate a role picker; role creation/editing stays
// console-only (RolesPage.tsx), a deliberately more complex governance
// surface than fits here.
func (c *Client) ListOrgRoles(ctx context.Context, token, organizationID string) ([]OrgRole, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		Roles []OrgRole `json:"roles"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/roles?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Roles, nil
}

// OrgRole mirrors seshat-server's iam.Role.
type OrgRole struct {
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
	System      bool     `json:"system"`
}
