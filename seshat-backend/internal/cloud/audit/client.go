// Package cloudaudit lets seshat-backend fetch an organization's real audit
// trail from seshat-server, for Admin Console's Audit Logs tab (see
// docs/helps/... "Admin Console" architecture item). Deliberately separate
// from internal/audit, which stays exactly what it always was — this
// device's own local activity log (file uploads, tool calls, ...), never
// touched by this package. internal/api/audit.go decides which of the two
// to serve per request: an admin whose device is connected to an
// organization sees the org's real trail (this package); everyone else
// (standalone, or a connected non-admin) keeps seeing local entries.
package cloudaudit

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// OrgAuditEvent mirrors seshat-server's iam.AuditEvent — the organization-
// wide record, never a per-device one. No IPAddress/Status fields exist on
// this side (seshat-server's audit trail only ever records events that
// succeeded), unlike internal/audit.Entry's local shape.
type OrgAuditEvent struct {
	ID             string            `json:"id"`
	OrganizationID string            `json:"organization_id"`
	ActorUserID    string            `json:"actor_user_id"`
	Action         string            `json:"action"`
	ResourceType   string            `json:"resource_type"`
	ResourceID     string            `json:"resource_id"`
	Metadata       map[string]string `json:"metadata"`
	CreatedAt      time.Time         `json:"created_at"`
}

type ListParams struct {
	ActorUserID  string
	Action       string
	ResourceType string
	Limit        int
	Offset       int
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

func (c *Client) ListOrgAuditEvents(ctx context.Context, token, organizationID string, params ListParams) ([]OrgAuditEvent, error) {
	q := url.Values{"organization_id": {organizationID}}
	if params.ActorUserID != "" {
		q.Set("actor_user_id", params.ActorUserID)
	}
	if params.Action != "" {
		q.Set("action", params.Action)
	}
	if params.ResourceType != "" {
		q.Set("resource_type", params.ResourceType)
	}
	if params.Limit > 0 {
		q.Set("limit", strconv.Itoa(params.Limit))
	}
	q.Set("offset", strconv.Itoa(params.Offset))

	var payload struct {
		AuditEvents []OrgAuditEvent `json:"audit_events"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/audit-events?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.AuditEvents, nil
}
