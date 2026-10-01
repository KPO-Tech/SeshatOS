// Package cloudinvitations lets seshat-backend manage an organization's
// pending/accepted/revoked/expired invitations (seshat-server's
// iam.Invitation) for Admin Console's Invitations tab - the exact same
// resource seshat-console's InvitationsPage.tsx edits. Distinct from
// cloudmemberships: a membership is someone who already has access: an
// invitation is a promise of access by email that hasn't been accepted
// yet (and may never be, if revoked or left to expire).
package cloudinvitations

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Invitation mirrors seshat-server's Invitation schema (openapi.yaml). Token
// is only ever populated in the response to CreateInvitation - it's the raw
// secret an invitee needs to accept, never re-exposed once the invitation is
// listed back.
type Invitation struct {
	ID             string     `json:"id"`
	OrganizationID string     `json:"organization_id"`
	Email          string     `json:"email"`
	Role           string     `json:"role"`
	Status         string     `json:"status"`
	Token          string     `json:"token,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
	AcceptedAt     *time.Time `json:"accepted_at,omitempty"`
	RevokedAt      *time.Time `json:"revoked_at,omitempty"`
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

// ListInvitations - status empty means every status, matching seshat-console's
// own "All" filter tab.
func (c *Client) ListInvitations(ctx context.Context, token, organizationID, status string) ([]Invitation, error) {
	q := url.Values{"organization_id": {organizationID}}
	if status != "" {
		q.Set("status", status)
	}
	var payload struct {
		Invitations []Invitation `json:"invitations"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/invitations?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.Invitations, nil
}

type CreateInvitationParams struct {
	OrganizationID string
	Email          string
	Role           string
	// ExpiresInDays <= 0 lets seshat-server apply its own default (7 days).
	ExpiresInDays int
}

func (c *Client) CreateInvitation(ctx context.Context, token string, params CreateInvitationParams) (*Invitation, error) {
	var invitation Invitation
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"email":           params.Email,
		"role":            params.Role,
	}
	if params.ExpiresInDays > 0 {
		body["expires_in_days"] = params.ExpiresInDays
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/invitations", token, body, &invitation); err != nil {
		return nil, err
	}
	return &invitation, nil
}

func (c *Client) RevokeInvitation(ctx context.Context, token, invitationID string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/invitations/"+invitationID+"/revoke", token, nil, nil)
	return err
}
