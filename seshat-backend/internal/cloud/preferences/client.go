package cloudpreferences

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's
// /users/me/preferences endpoint — same convention as cloudidentity.Client/
// cloudsettings.Client: no fixed token, each call takes the caller's own
// session token explicitly.
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

func (c *Client) GetMyPreferences(ctx context.Context, token string) (*remotePreferences, error) {
	var result remotePreferences
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/users/me/preferences", token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

type upsertRequest struct {
	PreferredName             string `json:"preferred_name"`
	Profession                string `json:"profession"`
	About                     string `json:"about"`
	WorkingStyle              string `json:"working_style"`
	ResponseStyle             string `json:"response_style"`
	ExtraContext              string `json:"extra_context"`
	InteractivePermissionMode string `json:"interactive_permission_mode"`
	AutomationPermissionMode  string `json:"automation_permission_mode"`
	MaxSubAgentDepth          int    `json:"max_sub_agent_depth"`
}

func (c *Client) UpsertMyPreferences(ctx context.Context, token string, req upsertRequest) (*remotePreferences, error) {
	var result remotePreferences
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/users/me/preferences", token, req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
