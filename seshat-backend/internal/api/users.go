package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	backendaudit "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/audit"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// ─── Request / Response types ──────────────────────────────────────────────────

type userProfileResponse struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	DisplayName  string     `json:"display_name"`
	Username     *string    `json:"username,omitempty"`
	Bio          *string    `json:"bio,omitempty"`
	AvatarURL    *string    `json:"avatar_url,omitempty"`
	Status       string     `json:"status"`
	LastActiveAt *time.Time `json:"last_active_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type updateProfileRequest struct {
	DisplayName *string `json:"display_name,omitempty"`
	Username    *string `json:"username,omitempty"`
	Bio         *string `json:"bio,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}

type deleteOwnAccountRequest struct {
	ConfirmEmail string `json:"confirm_email"`
}

type createAPIKeyRequest struct {
	Name      string     `json:"name"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
}

type apiKeyResponse struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	Name       string     `json:"name"`
	Key        string     `json:"key,omitempty"` // only at creation
	KeyMasked  string     `json:"key_masked"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type adminUpdateUserRequest struct {
	DisplayName *string `json:"display_name,omitempty"`
	Password    *string `json:"password,omitempty"`
	Status      *string `json:"status,omitempty"`
	Role        *string `json:"role,omitempty"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// handleListOrCreateUsers handles GET /api/v1/users (admin: paginated list) and
// POST /api/v1/users (admin: create user via resources service).
func (app *App) handleListOrCreateUsers(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		if err := backendauth.EnsureAdmin(principal); err != nil {
			writeBackendError(w, err)
			return
		}

		// Parse query params
		q := r.URL.Query()
		search := q.Get("search")
		roleFilter := q.Get("role")
		page, _ := strconv.Atoi(q.Get("page"))
		perPage, _ := strconv.Atoi(q.Get("per_page"))
		if page < 1 {
			page = 1
		}
		if perPage < 1 {
			perPage = 30
		}

		users, total, err := app.backend.Auth.ListUsersPaginated(r.Context(), principal, db.ListUsersParams{
			Search:     search,
			RoleFilter: roleFilter,
			Page:       page,
			PerPage:    perPage,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}

		out := make([]userProfileResponse, 0, len(users))
		for _, u := range users {
			out = append(out, toUserProfileResponse(u))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"users":    out,
			"total":    total,
			"page":     page,
			"per_page": perPage,
		})

	case http.MethodPost:
		// Delegate to the legacy handler which uses resources.Service
		app.handleUsersLegacy(w, r)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleUserMe handles GET/PUT/DELETE /api/v1/users/me
func (app *App) handleUserMe(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		user, err := app.backend.Auth.GetUserByID(r.Context(), principal, principal.User.ID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toUserProfileResponse(*user))

	case http.MethodPut:
		var req updateProfileRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		updated, err := app.backend.Auth.UpdateUserProfile(r.Context(), principal.User.ID, backendauth.ProfileUpdateParams{
			DisplayName: req.DisplayName,
			Username:    req.Username,
			Bio:         req.Bio,
			AvatarURL:   req.AvatarURL,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toUserProfileResponse(*updated))

	case http.MethodDelete:
		var req deleteOwnAccountRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		if err := app.backend.Auth.DeleteOwnAccount(r.Context(), principal, backendauth.DeleteOwnAccountParams{
			ConfirmEmail: req.ConfirmEmail,
		}); err != nil {
			writeBackendError(w, err)
			return
		}
		app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionAccountDelete,
			ResourceType: "user",
			ResourceID:   principal.User.ID,
			IPAddress:    app.clientIP(r),
			Status:       backendaudit.StatusSuccess,
		})
		writeJSON(w, http.StatusOK, map[string]any{"status": "account_closed"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleUserMeSettings handles GET/PUT /api/v1/users/me/settings
func (app *App) handleUserMeSettings(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		user, err := app.backend.Auth.GetUserByID(r.Context(), principal, principal.User.ID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		settings := user.Settings
		if settings == nil {
			settings = map[string]any{}
		}
		writeJSON(w, http.StatusOK, settings)

	case http.MethodPut:
		var settings map[string]any
		if !decodeJSONBody(w, r, &settings) {
			return
		}
		updated, err := app.backend.Auth.UpdateUserSettings(r.Context(), principal.User.ID, settings)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		out := updated.Settings
		if out == nil {
			out = map[string]any{}
		}
		writeJSON(w, http.StatusOK, out)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleUserMeAPIKeys handles GET/POST /api/v1/users/me/api-keys
func (app *App) handleUserMeAPIKeys(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		keys, err := app.backend.Auth.ListAPIKeys(r.Context(), principal.User.ID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		out := make([]apiKeyResponse, 0, len(keys))
		for _, k := range keys {
			out = append(out, toAPIKeyResponse(k, false))
		}
		writeJSON(w, http.StatusOK, map[string]any{"api_keys": out, "count": len(out)})

	case http.MethodPost:
		if !app.enableAPIKeys {
			writeJSONError(w, http.StatusForbidden, "api keys are disabled")
			return
		}
		var req createAPIKeyRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			writeJSONError(w, http.StatusBadRequest, "name is required")
			return
		}
		key, err := app.backend.Auth.CreateAPIKey(r.Context(), principal.User.ID, req.Name, req.ExpiresAt)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, toAPIKeyResponse(*key, true))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleUserMeAPIKeyByID handles DELETE /api/v1/users/me/api-keys/{id}
func (app *App) handleUserMeAPIKeyByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	keyID := strings.TrimPrefix(r.URL.Path, "/users/me/api-keys/")
	keyID = strings.Trim(keyID, "/")
	if keyID == "" {
		writeJSONError(w, http.StatusBadRequest, "api key id is required")
		return
	}

	if err := app.backend.Auth.RevokeAPIKey(r.Context(), keyID, principal.User.ID); err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "revoked"})
}

// handleUserByID handles GET/PUT/DELETE /api/v1/users/{id}
func (app *App) handleUserByID(w http.ResponseWriter, r *http.Request) {
	// Strip prefix — path may be /users/me (handled by separate route) or /users/{id}
	path := strings.TrimPrefix(r.URL.Path, "/users/")
	path = strings.Trim(path, "/")

	// If it's a sub-path (me/...) let those handlers deal with it.
	// But since /users/me is registered first in the mux, we only reach here for actual IDs.
	userID := path
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "user id is required")
		return
	}

	// If there's a slash remaining (sub-resource), the specific routes handle it.
	// E.g. /users/me/settings is a separate route.
	if strings.Contains(userID, "/") {
		writeJSONError(w, http.StatusNotFound, "not found")
		return
	}

	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	isSelf := principal.User.ID == userID
	isAdmin := principal.HasRole("admin")

	if !isSelf && !isAdmin {
		writeJSONError(w, http.StatusForbidden, "access denied")
		return
	}

	switch r.Method {
	case http.MethodGet:
		user, err := app.backend.Auth.GetUserByID(r.Context(), principal, userID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toUserProfileResponse(*user))

	case http.MethodPut:
		if !isAdmin {
			writeJSONError(w, http.StatusForbidden, `role "admin" required`)
			return
		}
		var req adminUpdateUserRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}

		user, err := app.backend.Auth.UpdateUser(r.Context(), principal, userID, backendauth.UpdateUserParams{
			DisplayName: req.DisplayName,
			Password:    req.Password,
			Status:      req.Status,
			Role:        req.Role,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionAdminUserUpdate,
			ResourceType: "user",
			ResourceID:   userID,
			IPAddress:    app.clientIP(r),
			Status:       backendaudit.StatusSuccess,
			Metadata:     map[string]any{"target_user_id": userID},
		})
		writeJSON(w, http.StatusOK, toAuthUserResponse(*user))

	case http.MethodDelete:
		if !isAdmin {
			writeJSONError(w, http.StatusForbidden, `role "admin" required`)
			return
		}
		if isSelf {
			writeJSONError(w, http.StatusBadRequest, "cannot delete yourself")
			return
		}
		app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID: principal.User.ID,
			Action:      backendaudit.ActionAdminUserDelete,
			IPAddress:   app.clientIP(r),
			Status:      backendaudit.StatusSuccess,
			Metadata:    map[string]any{"target_user_id": userID},
		})
		app.handleUserDelete(w, r)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ─── Auth service passthrough helpers ─────────────────────────────────────────

// GetUserByID is a helper that delegates to the identity store via the auth service.
// We expose it on the auth.Service for convenience.
func init() {
	// intentional no-op: the actual methods are on the backend service
}

// ─── Conversion helpers ────────────────────────────────────────────────────────

func toUserProfileResponse(u db.User) userProfileResponse {
	return userProfileResponse{
		ID:           u.ID,
		Email:        u.Email,
		DisplayName:  u.DisplayName,
		Username:     u.Username,
		Bio:          u.Bio,
		AvatarURL:    u.AvatarURL,
		Status:       u.Status,
		LastActiveAt: u.LastActiveAt,
		CreatedAt:    u.CreatedAt,
		UpdatedAt:    u.UpdatedAt,
	}
}

func toAPIKeyResponse(k db.APIKey, includeKey bool) apiKeyResponse {
	r := apiKeyResponse{
		ID:         k.ID,
		UserID:     k.UserID,
		Name:       k.Name,
		KeyMasked:  k.KeyMasked,
		ExpiresAt:  k.ExpiresAt,
		LastUsedAt: k.LastUsedAt,
		CreatedAt:  k.CreatedAt,
		UpdatedAt:  k.UpdatedAt,
	}
	if includeKey {
		r.Key = k.Key
	}
	return r
}
