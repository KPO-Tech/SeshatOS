package api

import (
	"net/http"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	clouddesktoppolicies "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/desktoppolicies"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Admin Console's Desktop Policies tab — these bindings already actively
// control this exact device's behavior (see seshat-ui's
// hooks/useDesktopPolicies.ts, which locks Settings/Providers based on the
// resolved bundle synced via /cloud/status) but until now had no
// admin-facing visibility or management surface on the desktop app itself.
// Same gabarit as adminTeamsClientForRequest/adminMembershipsClientForRequest.

func (a *App) adminDesktopPoliciesClientForRequest(w http.ResponseWriter, r *http.Request) (*clouddesktoppolicies.Client, string, string, bool) {
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
	return clouddesktoppolicies.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAdminDesktopPolicyCatalog — GET /api/v1/admin/desktop-policies/catalog
func (a *App) handleAdminDesktopPolicyCatalog(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.adminDesktopPoliciesClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	catalog, err := client.ListCatalog(r.Context(), token)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"desktop_policies": catalog, "count": len(catalog)})
}

// handleAdminDesktopPolicyBindings — GET/POST /api/v1/admin/desktop-policy-bindings
func (a *App) handleAdminDesktopPolicyBindings(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminDesktopPoliciesClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		bindings, err := client.ListBindings(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"desktop_policy_bindings": bindings, "count": len(bindings)})
	case http.MethodPost:
		var req struct {
			PolicyCode  string `json:"policy_code"`
			SubjectType string `json:"subject_type"`
			SubjectID   string `json:"subject_id"`
			Value       bool   `json:"value"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		binding, err := client.SetBinding(r.Context(), token, clouddesktoppolicies.SetBindingParams{
			OrganizationID: organizationID,
			PolicyCode:     req.PolicyCode,
			SubjectType:    req.SubjectType,
			SubjectID:      req.SubjectID,
			Value:          req.Value,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, binding)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminDesktopPolicyBindingDispatch — DELETE /api/v1/admin/desktop-policy-bindings/{id}
func (a *App) handleAdminDesktopPolicyBindingDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.adminDesktopPoliciesClientForRequest(w, r)
	if !ok {
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/desktop-policy-bindings/"), "/")
	if id == "" {
		writeJSONError(w, http.StatusNotFound, "desktop policy binding id is required")
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := client.DeleteBinding(r.Context(), token, id); err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
