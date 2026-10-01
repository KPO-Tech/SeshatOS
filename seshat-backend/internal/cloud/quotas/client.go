package cloudquotas

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Client is a thin, stateless HTTP client for seshat-server's
// /users/me/quota-usage endpoint — same convention as cloudpreferences.Client:
// no fixed token, each call takes the caller's own session token explicitly.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Client) GetUsage(ctx context.Context, token string) (*remoteUsageSummary, error) {
	var result remoteUsageSummary
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/users/me/quota-usage", token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) Increment(ctx context.Context, token, metric string, delta int64) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/users/me/quota-usage/increment", token, incrementRequest{Metric: metric, Delta: delta}, nil)
	return err
}
