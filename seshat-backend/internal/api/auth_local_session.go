package api

import (
	"net/http"

	backendaudit "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/audit"
)

// handleAuthLocalSession mints a session for standalone mode's auto-
// provisioned "continue without an account" identity - no email, no
// password, nothing the user ever types. This is the backend half of the
// desktop's "continue without an account" welcome-screen option.
//
// Deliberately gated to loopback callers only via the request's raw
// RemoteAddr (remoteAddrToIP, not clientIP/resolveClientIP - this must
// never honor a client-supplied X-Forwarded-For). Unlike handleLogin, this
// endpoint requires no secret at all, so anything able to reach it over the
// network gets a full session instantly; restricting it to the same
// machine the backend itself runs on is the only thing that makes that
// safe. The desktop talks to this backend over loopback already, so this
// adds no new requirement for it.
func (app *App) handleAuthLocalSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	remoteIP := remoteAddrToIP(r.RemoteAddr)
	if remoteIP == nil || !remoteIP.IsLoopback() {
		writeJSONError(w, http.StatusForbidden, "this endpoint is only reachable from the local machine")
		return
	}

	result, err := app.backend.Auth.LocalImplicitSession(r.Context())
	if err != nil {
		writeBackendError(w, err)
		return
	}

	app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
		ActorUserID: result.User.ID,
		Action:      backendaudit.ActionAuthLogin,
		IPAddress:   app.clientIP(r),
		Status:      backendaudit.StatusSuccess,
		Metadata:    map[string]any{"source": "local_implicit"},
	})
	writeJSON(w, http.StatusOK, loginResponse{
		Token:     result.Token,
		ExpiresAt: result.ExpiresAt,
		User:      toAuthUserResponse(result.User),
		Roles:     append([]string(nil), result.Roles...),
	})
}
