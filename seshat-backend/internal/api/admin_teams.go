package api

import (
	"net/http"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
	cloudteams "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/teams"
)

// Admin Console's organization-wide Teams tab — replaced the old local
// Group/GroupPermissions system (a per-device feature-permission bundle,
// removed - see docs/helps/... "Admin Console" architecture item). Writes
// here go straight to seshat-server's real iam.Group CRUD, the same store
// seshat-console's TeamsPage.tsx edits, so a change made from Admin Console
// shows up there immediately and vice versa. No local/standalone equivalent
// exists (there's no "organization" at all outside connected mode), so this
// mirrors adminProviderSettingsClientForRequest's shape.

func (a *App) adminTeamsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudteams.Client, string, string, bool) {
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
	return cloudteams.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAdminTeams — GET/POST /api/v1/admin/teams
func (a *App) handleAdminTeams(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminTeamsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		teams, err := client.ListOrgTeams(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"teams": teams, "count": len(teams)})
	case http.MethodPost:
		var req struct {
			Name          string   `json:"name"`
			Slug          string   `json:"slug"`
			Description   string   `json:"description"`
			MemberUserIDs []string `json:"member_user_ids"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		team, err := client.CreateOrgTeam(r.Context(), token, cloudteams.CreateOrgTeamParams{
			OrganizationID: organizationID,
			Name:           req.Name,
			Slug:           req.Slug,
			Description:    req.Description,
			MemberUserIDs:  req.MemberUserIDs,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, team)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminTeamDispatch — GET/PUT/DELETE /api/v1/admin/teams/{id}
func (a *App) handleAdminTeamDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.adminTeamsClientForRequest(w, r)
	if !ok {
		return
	}

	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/teams/"), "/")
	if id == "" {
		writeJSONError(w, http.StatusNotFound, "team id is required")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req struct {
			Name          string   `json:"name"`
			Slug          string   `json:"slug"`
			Description   string   `json:"description"`
			MemberUserIDs []string `json:"member_user_ids"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		team, err := client.UpdateOrgTeam(r.Context(), token, id, cloudteams.UpdateOrgTeamParams{
			Name:          req.Name,
			Slug:          req.Slug,
			Description:   req.Description,
			MemberUserIDs: req.MemberUserIDs,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, team)

	case http.MethodDelete:
		if err := client.DeleteOrgTeam(r.Context(), token, id); err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
