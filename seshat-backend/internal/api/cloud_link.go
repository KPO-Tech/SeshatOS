package api

import (
	"encoding/json"
	"net/http"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// These handlers cover pairing this device with a seshat-server: the status,
// the connection and the self-service registration. They run no jobs.

func (a *App) cloudLinkAvailable(w http.ResponseWriter) bool {
	if a.cloudAutomation == nil {
		writeBackendError(w, bkerr.Unavailable("cloud automation is not available", nil))
		return false
	}
	return true
}

// handleCloudStatus — GET /api/v1/cloud/status
func (a *App) handleCloudStatus(w http.ResponseWriter, r *http.Request) {
	if !a.cloudLinkAvailable(w) {
		return
	}
	status, err := a.cloudAutomation.Status(r.Context())
	if err != nil {
		writeBackendError(w, bkerr.Internal(err.Error(), err))
		return
	}
	writeJSON(w, http.StatusOK, status)
}

type connectCloudRequest struct {
	ServerURL   string `json:"server_url"`
	DeviceToken string `json:"device_token"`
}

// handleCloudConnect — POST /api/v1/cloud/connect
func (a *App) handleCloudConnect(w http.ResponseWriter, r *http.Request) {
	if !a.cloudLinkAvailable(w) {
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	var req connectCloudRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeBackendError(w, bkerr.InvalidInput("invalid request body", err))
		return
	}
	status, err := a.cloudAutomation.Connect(r.Context(), principal.User.ID, req.ServerURL, req.DeviceToken)
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// handleCloudRegisterDevice: POST /api/v1/cloud/register-device.
// One-click pairing: registers this machine as a device using the caller's
// existing authenticated session (no manual server_url/device_token entry),
// only available when this backend is itself running in connected mode.
func (a *App) handleCloudRegisterDevice(w http.ResponseWriter, r *http.Request) {
	if !a.cloudLinkAvailable(w) {
		return
	}
	if a.connectedServerURL == "" {
		writeBackendError(w, bkerr.InvalidInput("this device is not connected to an organization server", nil))
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	var req struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req) // name is optional; a missing/invalid body just means "use the default"

	status, err := a.cloudAutomation.RegisterAndConnect(
		r.Context(),
		principal.User.ID,
		a.connectedServerURL,
		principal.AuthSession.ID,
		principal.OrganizationID(),
		req.Name,
	)
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// handleCloudDisconnect — POST /api/v1/cloud/disconnect
func (a *App) handleCloudDisconnect(w http.ResponseWriter, r *http.Request) {
	if !a.cloudLinkAvailable(w) {
		return
	}
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if err := a.cloudAutomation.Disconnect(r.Context()); err != nil {
		writeBackendError(w, bkerr.Internal(err.Error(), err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
