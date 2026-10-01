package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	backendaudit "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/audit"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

type contextKey string

const authPrincipalContextKey contextKey = "auth_principal"

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"name"`
}

type loginResponse struct {
	Token     string           `json:"token"`
	ExpiresAt time.Time        `json:"expires_at"`
	User      authUserResponse `json:"user"`
	Roles     []string         `json:"roles"`
}

type authUserResponse struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	DisplayName string   `json:"display_name"`
	Status      string   `json:"status"`
	Roles       []string `json:"roles,omitempty"`
}

type authPrincipalResponse struct {
	User                 authUserResponse              `json:"user"`
	Roles                []string                      `json:"roles"`
	WorkspaceMemberships []workspaceMembershipResponse `json:"workspace_memberships"`
	// OrganizationID is the caller's single organization (this backend
	// enforces at most one per user - see auth.Principal.OrganizationID's
	// doc comment), correctly resolved for connected mode too (where
	// WorkspaceMemberships starts empty for a freshly connected account -
	// see ResolvedOrganizationID). This is the ONLY source seshat-ui's
	// useOrganizationStore has for "which organization" - it used to expect
	// a nonexistent "organizations" array here (copied from seshat-server's
	// own, different /auth/me shape), which this endpoint never returned,
	// leaving every org-scoped feature (Variables, Automation's Overview/
	// Projects) permanently stuck with no organization at all.
	OrganizationID string `json:"organization_id,omitempty"`
}

type workspaceMembershipResponse struct {
	OrganizationSlug string `json:"organization_slug"`
	WorkspaceSlug    string `json:"workspace_slug"`
	Role             string `json:"role"`
}

func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if app.loginRateLimiter != nil && !app.loginRateLimiter.Allow(app.clientIP(r)) {
		writeJSONError(w, http.StatusTooManyRequests, "too many login attempts — try again later")
		return
	}

	var req loginRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}

	result, err := app.backend.Auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID: req.Email,
			Action:      backendaudit.ActionAuthLoginFailed,
			IPAddress:   app.clientIP(r),
			Status:      backendaudit.StatusFailed,
			Metadata:    map[string]any{"email": req.Email},
		})
		writeBackendError(w, err)
		return
	}

	app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
		ActorUserID: result.User.ID,
		Action:      backendaudit.ActionAuthLogin,
		IPAddress:   app.clientIP(r),
		Status:      backendaudit.StatusSuccess,
	})
	writeJSON(w, http.StatusOK, loginResponse{
		Token:     result.Token,
		ExpiresAt: result.ExpiresAt,
		User:      toAuthUserResponse(result.User),
		Roles:     append([]string(nil), result.Roles...),
	})
}

func (app *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req registerRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}

	result, err := app.backend.Auth.Register(r.Context(), req.Email, req.Password, req.DisplayName)
	if err != nil {
		writeBackendError(w, err)
		return
	}

	app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
		ActorUserID: result.User.ID,
		Action:      backendaudit.ActionAuthLogin,
		IPAddress:   app.clientIP(r),
		Status:      backendaudit.StatusSuccess,
		Metadata:    map[string]any{"source": "register"},
	})
	writeJSON(w, http.StatusCreated, loginResponse{
		Token:     result.Token,
		ExpiresAt: result.ExpiresAt,
		User:      toAuthUserResponse(result.User),
		Roles:     append([]string(nil), result.Roles...),
	})
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if err := app.backend.Auth.Logout(r.Context(), principal); err != nil {
		writeBackendError(w, err)
		return
	}
	app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
		ActorUserID: principal.User.ID,
		Action:      backendaudit.ActionAuthLogout,
		IPAddress:   app.clientIP(r),
		Status:      backendaudit.StatusSuccess,
	})
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

func (app *App) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	writeJSON(w, http.StatusOK, authPrincipalResponse{
		User:                 toAuthUserResponse(principal.User),
		Roles:                append([]string(nil), principal.Roles...),
		WorkspaceMemberships: toWorkspaceMembershipResponses(principal.WorkspaceMemberships),
		OrganizationID:       principal.OrganizationID(),
	})
}

func (app *App) handleAdminPing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"user":   toAuthUserResponse(principal.User),
	})
}

func (app *App) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := bearerTokenFromRequest(r)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, err.Error())
			return
		}

		var principal *backendauth.Principal

		// API key path (sk- prefix)
		if strings.HasPrefix(token, "sk-") {
			principal, err = app.backend.Auth.ResolveAPIKeyPrincipal(r.Context(), token)
		} else {
			principal, err = app.backend.Auth.ResolvePrincipal(r.Context(), token)
		}

		if err != nil {
			writeBackendError(w, err)
			return
		}

		ctx := context.WithValue(r.Context(), authPrincipalContextKey, principal)
		if app.rateLimiter != nil && !app.rateLimiter.Allow(principal.User.ID) {
			writeJSONError(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (app *App) requireRole(roleName string, next http.Handler) http.Handler {
	return app.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, ok := authPrincipalFromContext(r.Context())
		if !ok {
			writeJSONError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if !principal.HasRole(roleName) {
			writeJSONError(w, http.StatusForbidden, fmt.Sprintf("role %q required", roleName))
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func bearerTokenFromRequest(r *http.Request) (string, error) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if header == "" {
		return "", fmt.Errorf("missing authorization header")
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return "", fmt.Errorf("invalid authorization header")
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, prefix))
	if token == "" {
		return "", fmt.Errorf("missing bearer token")
	}
	return token, nil
}

func toWorkspaceMembershipResponses(memberships []backendauth.WorkspaceMembership) []workspaceMembershipResponse {
	out := make([]workspaceMembershipResponse, 0, len(memberships))
	for _, m := range memberships {
		out = append(out, workspaceMembershipResponse{
			OrganizationSlug: m.OrganizationSlug,
			WorkspaceSlug:    m.WorkspaceSlug,
			Role:             m.Role,
		})
	}
	return out
}

func toAuthUserResponse(user backendauth.User) authUserResponse {
	return authUserResponse{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Status:      user.Status,
		Roles:       append([]string(nil), user.Roles...),
	}
}

// handleHealth returns enriched service health including DB connectivity.
func (app *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	components := map[string]string{}
	dbStatus := "ok"
	if app.db != nil {
		if err := app.db.Ping(r.Context()); err != nil {
			dbStatus = "error"
		}
	} else {
		dbStatus = "unconfigured"
	}
	components["database"] = dbStatus

	overall := "ok"
	for _, v := range components {
		if v != "ok" {
			overall = "degraded"
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if overall != "ok" {
		w.WriteHeader(http.StatusServiceUnavailable)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	if err := json.NewEncoder(w).Encode(map[string]any{
		"status":     overall,
		"version":    "0.1.0",
		"components": components,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "[API] handleHealth encode error: %v\n", err)
	}
}

// clientIP returns the real client IP, honouring forwarding headers only when
// the connection arrived from a configured trusted proxy.
func (app *App) clientIP(r *http.Request) string {
	return resolveClientIP(r, app.trustedProxyCIDRs)
}

// resolveClientIP is the testable core of clientIP.
// If RemoteAddr falls inside one of the trusted proxy CIDRs, X-Forwarded-For
// (leftmost value) or X-Real-Ip is returned. Otherwise RemoteAddr is used
// directly to prevent header spoofing by untrusted callers.
func resolveClientIP(r *http.Request, trusted []*net.IPNet) string {
	remoteIP := remoteAddrToIP(r.RemoteAddr)
	if len(trusted) > 0 && remoteIP != nil {
		for _, cidr := range trusted {
			if cidr.Contains(remoteIP) {
				if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
					return strings.TrimSpace(strings.SplitN(xff, ",", 2)[0])
				}
				if xri := strings.TrimSpace(r.Header.Get("X-Real-Ip")); xri != "" {
					return xri
				}
				break
			}
		}
	}
	if remoteIP != nil {
		return remoteIP.String()
	}
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx >= 0 {
		return addr[:idx]
	}
	return addr
}

// remoteAddrToIP extracts the IP portion from a RemoteAddr string such as
// "1.2.3.4:5678" or "[::1]:5678".
func remoteAddrToIP(addr string) net.IP {
	if idx := strings.LastIndex(addr, ":"); idx >= 0 {
		addr = addr[:idx]
	}
	return net.ParseIP(strings.Trim(addr, "[]"))
}

// ParseTrustedProxies parses a comma-separated list of CIDRs or bare IP
// addresses. Bare IPs are treated as /32 (IPv4) or /128 (IPv6). Invalid
// entries are silently skipped.
func ParseTrustedProxies(raw string) []*net.IPNet {
	var out []*net.IPNet
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if !strings.Contains(entry, "/") {
			if strings.Contains(entry, ":") {
				entry += "/128"
			} else {
				entry += "/32"
			}
		}
		_, cidr, err := net.ParseCIDR(entry)
		if err == nil {
			out = append(out, cidr)
		}
	}
	return out
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		fmt.Fprintf(os.Stderr, "[API] writeJSON encode error (status %d): %v\n", status, err)
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": message})
}

// decodeJSONBody decodes r.Body into v. Returns true on success.
// Returns false and writes the appropriate error response on failure:
//   - 413 if the body exceeded the MaxBytesReader limit
//   - 400 for any other decode error
func decodeJSONBody(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "request body too large (max 4 MB)")
			return false
		}
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func writeBackendError(w http.ResponseWriter, err error) {
	switch bkerr.KindOf(err) {
	case bkerr.ErrorKindInvalidInput:
		writeJSONError(w, http.StatusBadRequest, bkerr.Message(err))
	case bkerr.ErrorKindUnauthorized:
		writeJSONError(w, http.StatusUnauthorized, bkerr.Message(err))
	case bkerr.ErrorKindForbidden:
		writeJSONError(w, http.StatusForbidden, bkerr.Message(err))
	case bkerr.ErrorKindNotFound:
		writeJSONError(w, http.StatusNotFound, bkerr.Message(err))
	case bkerr.ErrorKindConflict:
		writeJSONError(w, http.StatusConflict, bkerr.Message(err))
	case bkerr.ErrorKindTooLarge:
		writeJSONError(w, http.StatusRequestEntityTooLarge, bkerr.Message(err))
	case bkerr.ErrorKindRateLimit:
		writeJSONError(w, http.StatusTooManyRequests, bkerr.Message(err))
	case bkerr.ErrorKindBadGateway:
		writeJSONError(w, http.StatusBadGateway, bkerr.Message(err))
	case bkerr.ErrorKindUnavailable:
		writeJSONError(w, http.StatusServiceUnavailable, bkerr.Message(err))
	default:
		writeJSONError(w, http.StatusInternalServerError, bkerr.Message(err))
	}
}
