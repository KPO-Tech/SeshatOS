package api

import (
	"net/http"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	cloudhttp "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
	cloudinvitations "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/invitations"
)

// Admin Console's Invitations tab — pending/accepted/revoked/expired invites
// to join this organization by email, distinct from the Users tab
// (admin_memberships.go): a membership is someone who already has access,
// an invitation is a promise of access that hasn't been accepted yet.

func (a *App) adminInvitationsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudinvitations.Client, string, string, bool) {
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
	return cloudinvitations.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAdminInvitations — GET/POST /api/v1/admin/invitations
func (a *App) handleAdminInvitations(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminInvitationsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		status := r.URL.Query().Get("status")
		invitations, err := client.ListInvitations(r.Context(), token, organizationID, status)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"invitations": invitations, "count": len(invitations)})
	case http.MethodPost:
		var req struct {
			Email         string `json:"email"`
			Role          string `json:"role"`
			ExpiresInDays int    `json:"expires_in_days"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		invitation, err := client.CreateInvitation(r.Context(), token, cloudinvitations.CreateInvitationParams{
			OrganizationID: organizationID,
			Email:          req.Email,
			Role:           req.Role,
			ExpiresInDays:  req.ExpiresInDays,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, invitation)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminInvitationRevoke — POST /api/v1/admin/invitations/{id}/revoke
func (a *App) handleAdminInvitationRevoke(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.adminInvitationsClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/admin/invitations/")
	id = strings.TrimSuffix(id, "/revoke")
	id = strings.Trim(id, "/")
	if id == "" {
		writeJSONError(w, http.StatusNotFound, "invitation id is required")
		return
	}
	if err := client.RevokeInvitation(r.Context(), token, id); err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
