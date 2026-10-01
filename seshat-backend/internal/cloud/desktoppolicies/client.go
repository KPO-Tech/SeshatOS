// Package clouddesktoppolicies lets seshat-backend manage an organization's
// real desktop policy bindings (seshat-server's iam.DesktopPolicyBinding)
// for Admin Console's Desktop Policies tab. These bindings already actively
// control this exact device's behavior (see seshat-ui's
// hooks/useDesktopPolicies.ts, which reads the resolved bundle from
// /automation/status and locks Settings/Providers accordingly) - but until
// now an org admin had no way to see or manage them without opening
// seshat-console in a browser. See docs/helps/... "Admin Console"
// architecture item.
package clouddesktoppolicies

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// DesktopPolicy is one entry from the fixed, code-defined catalog - not
// organization-specific data, so no organization_id is needed to fetch it.
type DesktopPolicy struct {
	Code               string `json:"code"`
	AdminDescription   string `json:"admin_description"`
	UserBlockedMessage string `json:"user_blocked_message"`
	DefaultValue       bool   `json:"default_value"`
}

// DesktopPolicyBinding mirrors seshat-server's iam.DesktopPolicyBinding.
type DesktopPolicyBinding struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organization_id"`
	PolicyCode     string    `json:"policy_code"`
	SubjectType    string    `json:"subject_type"`
	SubjectID      string    `json:"subject_id"`
	Value          bool      `json:"value"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
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

func (c *Client) ListCatalog(ctx context.Context, token string) ([]DesktopPolicy, error) {
	var payload struct {
		DesktopPolicies []DesktopPolicy `json:"desktop_policies"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/desktop-policies/catalog", token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.DesktopPolicies, nil
}

func (c *Client) ListBindings(ctx context.Context, token, organizationID string) ([]DesktopPolicyBinding, error) {
	q := url.Values{"organization_id": {organizationID}}
	var payload struct {
		DesktopPolicyBindings []DesktopPolicyBinding `json:"desktop_policy_bindings"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/desktop-policy-bindings?"+q.Encode(), token, nil, &payload); err != nil {
		return nil, err
	}
	return payload.DesktopPolicyBindings, nil
}

// SetBindingParams — upsert semantics on seshat-server: re-targeting the
// same (organization, policy_code, subject_type, subject_id) updates the
// existing row's Value rather than creating a duplicate.
type SetBindingParams struct {
	OrganizationID string
	PolicyCode     string
	SubjectType    string
	SubjectID      string
	Value          bool
}

func (c *Client) SetBinding(ctx context.Context, token string, params SetBindingParams) (*DesktopPolicyBinding, error) {
	var binding DesktopPolicyBinding
	body := map[string]any{
		"organization_id": params.OrganizationID,
		"policy_code":     params.PolicyCode,
		"subject_type":    params.SubjectType,
		"subject_id":      params.SubjectID,
		"value":           params.Value,
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/desktop-policy-bindings", token, body, &binding); err != nil {
		return nil, err
	}
	return &binding, nil
}

func (c *Client) DeleteBinding(ctx context.Context, token, bindingID string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.serverURL+"/api/v1/desktop-policy-bindings/"+bindingID, token, nil, nil)
	return err
}
