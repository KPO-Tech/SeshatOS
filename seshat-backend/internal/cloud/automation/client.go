package cloudautomation

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Client is a thin HTTP client for the one device-authenticated call this
// desktop makes to seshat-server: POST /device/heartbeat, which reports
// liveness and brings back what the organization governs here (policies,
// minimum app version, organization rules). Claiming and reporting runs no
// longer exists: automation runs in the Cloud only.
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
// out (if non-nil). Returns the HTTP status code.
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
