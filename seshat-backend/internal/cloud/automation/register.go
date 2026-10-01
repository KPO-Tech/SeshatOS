package cloudautomation

import (
	"context"
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// registerDevice calls seshat-server's self-service device registration
// endpoint (POST /api/v1/devices), authenticated with the caller's own
// session token rather than a device token; there is no device token yet,
// that's exactly what this call produces.
func registerDevice(ctx context.Context, httpClient *http.Client, serverURL, userToken string, params registerDeviceParams) (*registerDeviceResult, error) {
	serverURL = strings.TrimRight(strings.TrimSpace(serverURL), "/")
	var result registerDeviceResult
	if _, err := cloudhttp.Do(ctx, httpClient, http.MethodPost, serverURL+"/api/v1/devices", userToken, params, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
