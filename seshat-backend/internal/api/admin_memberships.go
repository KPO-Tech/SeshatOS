package api

import (
	"net/http"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	cloudmemberships "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/memberships"
)

// Admin Console's Users tab — deliberately built on seshat-server's
// /api/v1/memberships, NOT /api/v1/users. See cloudmemberships' package doc
// comment for why: the /users resource is platform-wide and requires the
// rare platform super-admin flag, which a normal org admin never has. A
// membership's role is the one thing an org admin can actually manage here,
// same as seshat-console's MembershipsPage.tsx.

func (a *App) adminMembershipsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudmemberships.Client, string, string, bool) {
	if a.connectedServerURL == "" {
		writeJSONError(w, http.StatusBadRequest, "this device is not connected to an organization server")
		return nil, "", "", false
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return nil, "", "", false
	}
	if err := backendauth.EnsureAdmin(principal); err != nil {
		writeBackendError(w, err)
		return nil, "", "", false
	}
	return cloudmemberships.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAdminMemberships — GET/POST /api/v1/admin/memberships
func (a *App) handleAdminMemberships(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminMembershipsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		memberships, err := client.ListOrgMemberships(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"memberships": memberships, "count": len(memberships)})
	case http.MethodPost:
		var req struct {
			Email       string `json:"email"`
			DisplayName string `json:"display_name"`
			Role        string `json:"role"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		membership, err := client.CreateOrgMemberDirect(r.Context(), token, cloudmemberships.CreateOrgMemberDirectParams{
			OrganizationID: organizationID,
			Email:          req.Email,
			DisplayName:    req.DisplayName,
			Role:           req.Role,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, membership)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminMembershipDispatch — PUT/DELETE /api/v1/admin/memberships/{id}
func (a *App) handleAdminMembershipDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.adminMembershipsClientForRequest(w, r)
	if !ok {
		return
	}

	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/memberships/"), "/")
	if id == "" {
		writeJSONError(w, http.StatusNotFound, "membership id is required")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req struct {
			Role string `json:"role"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		membership, err := client.UpdateOrgMembershipRole(r.Context(), token, id, req.Role)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, membership)

	case http.MethodDelete:
		if err := client.DeleteOrgMembership(r.Context(), token, id); err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminRoles — GET /api/v1/admin/roles. Read-only role catalog (built-
// in + any custom roles already defined via seshat-console's Roles page),
// used only to populate the role picker in handleAdminMemberships above.
// Creating/editing roles stays console-only.
func (a *App) handleAdminRoles(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminMembershipsClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	roles, err := client.ListOrgRoles(r.Context(), token, organizationID)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"roles": roles, "count": len(roles)})
}
