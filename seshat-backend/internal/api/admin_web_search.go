package api

import (
	"net/http"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
	cloudwebsearch "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/websearch"
)

// Admin Console's organization-wide Web Search tab — the domain policy
// (allowed/blocked domains) is the only org-scoped thing to configure here;
// unlike LLM providers, there is no org-wide web-search "provider" concept
// on seshat-server at all (every provider credential is personal, per
// user - see websearch.Service.UpsertProvider, unaffected by this file).
// Same jobsClientForRequest-style direct passthrough as
// admin_provider_settings.go, for the same reason: no local/standalone
// equivalent exists for an organization's domain policy.

func (a *App) adminWebSearchClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudwebsearch.Client, string, string, bool) {
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
	return cloudwebsearch.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAdminWebSearchOrgPolicy — GET/PUT /api/v1/admin/web-search-org-policy
func (a *App) handleAdminWebSearchOrgPolicy(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminWebSearchClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		policy, err := client.GetOrgPolicy(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, policy)
	case http.MethodPut:
		var req struct {
			AllowedDomains []string `json:"allowed_domains"`
			BlockedDomains []string `json:"blocked_domains"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		policy, err := client.UpsertOrgPolicy(r.Context(), token, cloudwebsearch.UpsertOrgPolicyParams{
			OrganizationID: organizationID,
			AllowedDomains: req.AllowedDomains,
			BlockedDomains: req.BlockedDomains,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, policy)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
