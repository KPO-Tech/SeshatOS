package api

import (
	"net/http"
	"os"
	"strings"
	"time"

	backendaudit "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/audit"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

type deviceStartRequest struct {
	ClientName string `json:"client_name"`
}

type devicePollRequest struct {
	DeviceCode string `json:"device_code"`
}

// devicePollResponse is one answer of a poll. Token, User and the rest are set only when Status is
// "approved", and then they have the shape of a login response.
type devicePollResponse struct {
	Status    string            `json:"status"`
	Token     string            `json:"token,omitempty"`
	ExpiresAt *time.Time        `json:"expires_at,omitempty"`
	User      *authUserResponse `json:"user,omitempty"`
	Roles     []string          `json:"roles,omitempty"`
}

// deviceLoginAllowed answers false (and writes the refusal) unless the request comes from the desktop app
// on this machine. Like the local session, these routes need no secret of the caller's own, so loopback
// plus the desktop's proof is what stops a web page that reached the port from starting a sign-in or
// collecting one.
func (app *App) deviceLoginAllowed(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return false
	}
	remoteIP := remoteAddrToIP(r.RemoteAddr)
	if remoteIP == nil || !remoteIP.IsLoopback() {
		writeJSONError(w, http.StatusForbidden, "this endpoint is only reachable from the local machine")
		return false
	}
	if !desktopProofValid(r, deviceLoginProofContext) && !strings.EqualFold(strings.TrimSpace(os.Getenv(allowUnprovenLocalSessionEnv)), "true") {
		writeJSONError(w, http.StatusForbidden, "device sign-in is only available to the desktop app")
		return false
	}
	return true
}

// handleDeviceLoginStart - POST /api/v1/auth/device/start: asks the organization's server for a code.
func (app *App) handleDeviceLoginStart(w http.ResponseWriter, r *http.Request) {
	if !app.deviceLoginAllowed(w, r) {
		return
	}
	if app.loginRateLimiter != nil && !app.loginRateLimiter.Allow(app.clientIP(r)) {
		writeJSONError(w, http.StatusTooManyRequests, "too many sign-in attempts — try again later")
		return
	}
	var req deviceStartRequest
	if r.ContentLength != 0 && !decodeJSONBody(w, r, &req) {
		return
	}
	login, err := app.backend.Auth.StartDeviceLogin(r.Context(), strings.TrimSpace(req.ClientName))
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, login)
}

// handleDeviceLoginPoll - POST /api/v1/auth/device/poll: whether the person approved the code yet.
func (app *App) handleDeviceLoginPoll(w http.ResponseWriter, r *http.Request) {
	if !app.deviceLoginAllowed(w, r) {
		return
	}
	var req devicePollRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.DeviceCode) == "" {
		writeBackendError(w, bkerr.InvalidInput("device_code is required", nil))
		return
	}
	poll, err := app.backend.Auth.PollDeviceLogin(r.Context(), req.DeviceCode)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	if poll.Status != backendauth.DeviceApproved || poll.Login == nil {
		writeJSON(w, http.StatusOK, devicePollResponse{Status: poll.Status})
		return
	}
	app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
		ActorUserID: poll.Login.User.ID,
		Action:      backendaudit.ActionAuthLogin,
		IPAddress:   app.clientIP(r),
		Status:      backendaudit.StatusSuccess,
		Metadata:    map[string]any{"source": "device_code"},
	})
	user := toAuthUserResponse(poll.Login.User)
	expires := poll.Login.ExpiresAt
	writeJSON(w, http.StatusOK, devicePollResponse{
		Status:    poll.Status,
		Token:     poll.Login.Token,
		ExpiresAt: &expires,
		User:      &user,
		Roles:     append([]string(nil), poll.Login.Roles...),
	})
}
