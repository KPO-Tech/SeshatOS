package api

import (
	"net/http"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	cloudconnectors "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/connectors"
	cloudhttp "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Admin Console's organization-wide Connectors tab — deliberately separate
// from any personal/self-service connector view: writes here go straight
// to seshat-server's real connectors.Service.ListOAuthApps/RegisterOAuthApp,
// the same store seshat-console's ConnectorsPage.tsx "OAuth apps" modal
// edits, so a change made from Admin Console shows up there immediately
// and vice versa. Same shape as admin_provider_settings.go.

func (a *App) adminConnectorsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudconnectors.Client, string, string, bool) {
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
	return cloudconnectors.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleAdminConnectorOAuthApps — GET /api/v1/admin/connector-oauth-apps
func (a *App) handleAdminConnectorOAuthApps(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminConnectorsClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	apps, err := client.ListOAuthApps(r.Context(), token, organizationID)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"oauth_apps": apps, "count": len(apps)})
}

// handleAdminConnectorOAuthAppByKind — PUT /api/v1/admin/connector-oauth-apps/{kind}
func (a *App) handleAdminConnectorOAuthAppByKind(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminConnectorsClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	kind := strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/connector-oauth-apps/"), "/")
	if kind == "" {
		writeJSONError(w, http.StatusBadRequest, "missing connector kind")
		return
	}
	var req struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
		Subdomain    string `json:"subdomain"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	app, err := client.RegisterOAuthApp(r.Context(), token, cloudconnectors.RegisterOAuthAppParams{
		OrganizationID: organizationID,
		Kind:           kind,
		ClientID:       req.ClientID,
		ClientSecret:   req.ClientSecret,
		Subdomain:      req.Subdomain,
	})
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, app)
}
