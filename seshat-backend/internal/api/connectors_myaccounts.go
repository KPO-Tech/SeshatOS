package api

import (
	"net/http"

	cloudconnectors "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/connectors"
	cloudhttp "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Workspace → Connections: any authenticated employee connects their own
// account (agent_action) against whichever OAuth app the organization
// already registered (Admin Console's Connectors tab, admin_connectors.go)
// - deliberately no EnsureAdmin check here, unlike
// adminConnectorsClientForRequest, since this is a self-service action any
// org member takes for themselves, not an org-wide setting.
//
// These handlers are dispatched from handleConnectorsDispatch
// (connectoraction.go) rather than registered as their own routes - that
// function already owns the whole /connectors/ prefix (a local, desktop-
// only connector-account system unrelated to this one), so a second
// registration for any /connectors/... path would never be reached. See
// handleConnectorsDispatch's own switch for how "my-accounts"/oauth-start/
// static-account are told apart from a real connector kind and from that
// local system's own routes.
func (a *App) connectorsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudconnectors.Client, string, string, bool) {
	if a.connectedServerURL == "" {
		writeJSONError(w, http.StatusBadRequest, "this device is not connected to an organization server")
		return nil, "", "", false
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return nil, "", "", false
	}
	return cloudconnectors.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// handleMyConnectorAccounts — GET /connectors/my-accounts
func (a *App) handleMyConnectorAccounts(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.connectorsClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	accounts, err := client.ListMyAccounts(r.Context(), token, organizationID)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connector_accounts": accounts, "count": len(accounts)})
}

// handleMyConnectorAccountByID — DELETE /connectors/my-accounts/{accountID}
func (a *App) handleMyConnectorAccountByID(w http.ResponseWriter, r *http.Request, accountID string) {
	client, token, _, ok := a.connectorsClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if accountID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing connector account id")
		return
	}
	if err := client.DeleteMyAccount(r.Context(), token, accountID); err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleConnectorOAuthStart — POST /connectors/{kind}/oauth/start
func (a *App) handleConnectorOAuthStart(w http.ResponseWriter, r *http.Request, kind string) {
	client, token, organizationID, ok := a.connectorsClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		DisplayName string `json:"display_name"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	authorizationURL, err := client.BeginOAuth(r.Context(), token, cloudconnectors.BeginOAuthParams{
		OrganizationID: organizationID,
		Kind:           kind,
		Purpose:        "agent_action",
		DisplayName:    req.DisplayName,
	})
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authorization_url": authorizationURL})
}

// handleConnectorStaticAccount — POST /connectors/{kind}/static-account
func (a *App) handleConnectorStaticAccount(w http.ResponseWriter, r *http.Request, kind string) {
	client, token, organizationID, ok := a.connectorsClientForRequest(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		DisplayName string `json:"display_name"`
		Secret      string `json:"secret"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	account, err := client.CreateStaticAccount(r.Context(), token, cloudconnectors.CreateStaticAccountParams{
		OrganizationID: organizationID,
		Kind:           kind,
		DisplayName:    req.DisplayName,
		Secret:         req.Secret,
	})
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusCreated, account)
}
