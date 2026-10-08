package cloudautomation

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Client is a thin HTTP client for seshat-server's device-authenticated
// automation protocol (POST /device/heartbeat, /device/runs/claim,
// /device/runs/{id}/job|start|heartbeat|complete|fail, GET /device/runs).
type Client struct {
	serverURL   string
	deviceToken string
	httpClient  *http.Client
}

func NewClient(serverURL, deviceToken string) *Client {
	return &Client{
		serverURL:   strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		deviceToken: deviceToken,
		httpClient:  &http.Client{Timeout: 30 * time.Second},
	}
}

// do sends a device-authenticated request and decodes a JSON response into
// out (if non-nil). Returns the HTTP status code so callers can special-case
// 204 (e.g. "nothing to claim") without treating it as an error.
func (c *Client) do(ctx context.Context, method, path string, body, out any) (int, error) {
	return cloudhttp.Do(ctx, c.httpClient, method, c.serverURL+path, c.deviceToken, body, out)
}

// Heartbeat reports liveness and returns the device record seshat-server
// has for this token (used at Connect time to capture the device's id/name).
func (c *Client) Heartbeat(ctx context.Context) (*Device, error) {
	var device Device
	if _, err := c.do(ctx, http.MethodPost, "/api/v1/device/heartbeat", nil, &device); err != nil {
		return nil, err
	}
	return &device, nil
}
