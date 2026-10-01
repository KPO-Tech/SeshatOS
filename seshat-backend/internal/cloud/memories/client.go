package cloudmemories

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's
// /users/me/memories endpoints — same convention as cloudpreferences.Client:
// no fixed token, each call takes the caller's own session token explicitly.
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

func (c *Client) List(ctx context.Context, token string) ([]remoteMemory, error) {
	var result listResponse
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/users/me/memories", token, nil, &result); err != nil {
		return nil, err
	}
	return result.Memories, nil
}

func (c *Client) Create(ctx context.Context, token string, req createRequest) (*remoteMemory, error) {
	var result remoteMemory
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/users/me/memories", token, req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) Update(ctx context.Context, token, id string, req updateRequest) (*remoteMemory, error) {
	var result remoteMemory
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.serverURL+"/api/v1/users/me/memories/"+id, token, req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) Delete(ctx context.Context, token, id string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.serverURL+"/api/v1/users/me/memories/"+id, token, nil, nil)
	return err
}

func (c *Client) DeleteAll(ctx context.Context, token string) (int64, error) {
	var result deleteAllResponse
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.serverURL+"/api/v1/users/me/memories", token, nil, &result); err != nil {
		return 0, err
	}
	return result.Deleted, nil
}
