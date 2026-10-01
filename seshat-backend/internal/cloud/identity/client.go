package cloudidentity

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Client is a thin HTTP client for seshat-server's IAM endpoints
// (/api/v1/auth/*, /users, /organizations). Unlike cloudautomation.Client
// (one fixed device token for the whole machine), this client is stateless —
// each local user has their own session token, passed explicitly per call.
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

func (c *Client) do(ctx context.Context, method, path, token string, body, out any) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, method, c.serverURL+path, token, body, out)
	return err
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

func (c *Client) Login(ctx context.Context, email, password string) (*AuthResult, error) {
	var result AuthResult
	if err := c.do(ctx, http.MethodPost, "/api/v1/auth/login", "", map[string]string{
		"email":    email,
		"password": password,
	}, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) Me(ctx context.Context, token string) (*meResponse, error) {
	var result meResponse
	if err := c.do(ctx, http.MethodGet, "/api/v1/auth/me", token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) Logout(ctx context.Context, token string) error {
	return c.do(ctx, http.MethodPost, "/api/v1/auth/logout", token, nil, nil)
}

// ─── Users ────────────────────────────────────────────────────────────────────

func (c *Client) ListUsers(ctx context.Context, token, search string, limit, offset int) ([]User, int64, error) {
	q := url.Values{}
	if search != "" {
		q.Set("q", search)
	}
	q.Set("limit", strconv.Itoa(limit))
	q.Set("offset", strconv.Itoa(offset))
	var result listUsersResponse
	if err := c.do(ctx, http.MethodGet, "/api/v1/users?"+q.Encode(), token, nil, &result); err != nil {
		return nil, 0, err
	}
	return result.Users, result.Total, nil
}

func (c *Client) GetUser(ctx context.Context, token, userID string) (*User, error) {
	var user User
	if err := c.do(ctx, http.MethodGet, "/api/v1/users/"+userID, token, nil, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (c *Client) CreateUser(ctx context.Context, token, organizationID, role string, email, password, displayName string) (*User, error) {
	var user User
	err := c.do(ctx, http.MethodPost, "/api/v1/users", token, map[string]any{
		"email":           email,
		"password":        password,
		"display_name":    displayName,
		"organization_id": organizationID,
		"role":            role,
	}, &user)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (c *Client) UpdateUser(ctx context.Context, token, userID string, email, displayName *string) (*User, error) {
	body := map[string]any{}
	if email != nil {
		body["email"] = *email
	}
	if displayName != nil {
		body["display_name"] = *displayName
	}
	var user User
	if err := c.do(ctx, http.MethodPut, "/api/v1/users/"+userID, token, body, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (c *Client) DeleteUser(ctx context.Context, token, userID string) error {
	return c.do(ctx, http.MethodDelete, "/api/v1/users/"+userID, token, nil, nil)
}

// ─── Organizations ────────────────────────────────────────────────────────────

func (c *Client) ListOrganizations(ctx context.Context, token string) ([]Organization, error) {
	var result listOrganizationsResponse
	if err := c.do(ctx, http.MethodGet, "/api/v1/organizations", token, nil, &result); err != nil {
		return nil, err
	}
	return result.Organizations, nil
}

func (c *Client) GetOrganization(ctx context.Context, token, organizationID string) (*Organization, error) {
	var org Organization
	if err := c.do(ctx, http.MethodGet, "/api/v1/organizations/"+organizationID, token, nil, &org); err != nil {
		return nil, err
	}
	return &org, nil
}

func (c *Client) UpdateOrganization(ctx context.Context, token, organizationID string, name, slug *string) (*Organization, error) {
	body := map[string]any{}
	if name != nil {
		body["name"] = *name
	}
	if slug != nil {
		body["slug"] = *slug
	}
	var org Organization
	if err := c.do(ctx, http.MethodPut, "/api/v1/organizations/"+organizationID, token, body, &org); err != nil {
		return nil, err
	}
	return &org, nil
}

func (c *Client) DeleteOrganization(ctx context.Context, token, organizationID string) error {
	return c.do(ctx, http.MethodDelete, "/api/v1/organizations/"+organizationID, token, nil, nil)
}
