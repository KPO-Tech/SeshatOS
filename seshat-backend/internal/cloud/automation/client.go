package cloudautomation

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
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

// ClaimRun returns the oldest queued run assigned to this device, or
// (nil, nil) when there's nothing to claim right now — normal during
// polling, not an error.
func (c *Client) ClaimRun(ctx context.Context) (*Run, error) {
	var run Run
	status, err := c.do(ctx, http.MethodPost, "/api/v1/device/runs/claim", nil, &run)
	if err != nil {
		return nil, err
	}
	if status == http.StatusNoContent {
		return nil, nil
	}
	return &run, nil
}

// GetRunJob fetches the execution payload for a run this device currently holds.
func (c *Client) GetRunJob(ctx context.Context, runID string) (*RunJob, error) {
	var job RunJob
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/device/runs/"+runID+"/job", nil, &job); err != nil {
		return nil, err
	}
	return &job, nil
}

func (c *Client) StartRun(ctx context.Context, runID string) error {
	_, err := c.do(ctx, http.MethodPost, "/api/v1/device/runs/"+runID+"/start", nil, nil)
	return err
}

func (c *Client) HeartbeatRun(ctx context.Context, runID string) error {
	_, err := c.do(ctx, http.MethodPost, "/api/v1/device/runs/"+runID+"/heartbeat", nil, nil)
	return err
}

func (c *Client) CompleteRun(ctx context.Context, runID, outputText string) error {
	_, err := c.do(ctx, http.MethodPost, "/api/v1/device/runs/"+runID+"/complete", map[string]string{"output_text": outputText}, nil)
	return err
}

func (c *Client) FailRun(ctx context.Context, runID, errorText string) error {
	_, err := c.do(ctx, http.MethodPost, "/api/v1/device/runs/"+runID+"/fail", map[string]string{"error_text": errorText}, nil)
	return err
}

// MyRuns returns every non-terminal run currently assigned to this device —
// used for the local "recent runs" visibility list, not for claiming.
func (c *Client) MyRuns(ctx context.Context) ([]Run, error) {
	var payload struct {
		Runs []Run `json:"runs"`
	}
	if _, err := c.do(ctx, http.MethodGet, "/api/v1/device/runs", nil, &payload); err != nil {
		return nil, err
	}
	return payload.Runs, nil
}
