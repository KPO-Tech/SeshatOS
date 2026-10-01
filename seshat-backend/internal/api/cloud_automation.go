package api

import (
	"encoding/json"
	"net/http"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// These handlers cover pairing this device and read-only run visibility.
// Job management (create/edit/pause/delete/trigger) lives in automation_jobs.go.

func (a *App) cloudAutomationAvailable(w http.ResponseWriter) bool {
	if a.cloudAutomation == nil {
		writeBackendError(w, bkerr.Unavailable("cloud automation is not available", nil))
		return false
	}
	return true
}

// handleAutomationStatus — GET /api/v1/automation/status
func (a *App) handleAutomationStatus(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
		return
	}
	status, err := a.cloudAutomation.Status(r.Context())
	if err != nil {
		writeBackendError(w, bkerr.Internal(err.Error(), err))
		return
	}
	// First status check while disconnected on an organization-connected
	// backend: try a silent self-registration, which only actually takes
	// effect if the organization has no device at all yet - see
	// AutoRegisterFirstDevice's own doc comment.
	if !status.Connected && a.connectedServerURL != "" {
		if principal, ok := authPrincipalFromContext(r.Context()); ok {
			status = a.cloudAutomation.AutoRegisterFirstDevice(r.Context(), principal.User.ID, a.connectedServerURL, principal.AuthSession.ID, principal.OrganizationID())
		}
	}
	writeJSON(w, http.StatusOK, status)
}

type connectAutomationRequest struct {
	ServerURL   string `json:"server_url"`
	DeviceToken string `json:"device_token"`
}

// handleAutomationConnect — POST /api/v1/automation/connect
func (a *App) handleAutomationConnect(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	var req connectAutomationRequest
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

// handleAutomationRegisterDevice: POST /api/v1/automation/register-device.
// One-click pairing: registers this machine as a device using the caller's
// existing authenticated session (no manual server_url/device_token entry),
// only available when this backend is itself running in connected mode.
func (a *App) handleAutomationRegisterDevice(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
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

// handleAutomationDisconnect — POST /api/v1/automation/disconnect
func (a *App) handleAutomationDisconnect(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
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

// handleAutomationRuns — GET /api/v1/automation/runs (read-only visibility
// of runs assigned to this device; management stays in seshat-console).
func (a *App) handleAutomationRuns(w http.ResponseWriter, r *http.Request) {
	if !a.cloudAutomationAvailable(w) {
		return
	}
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	runs, err := a.cloudAutomation.RecentRuns(r.Context())
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"runs": runs, "count": len(runs)})
}
