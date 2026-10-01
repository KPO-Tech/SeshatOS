package api

import (
	"net/http"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	cloudhttp "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	cloudmcp "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/mcp"
)

// Admin Console's organization-wide MCP Servers tab — deliberately separate
// from ResolveServerConfigs (any org member, decrypted env/headers, for
// actually loading a server locally once approved): writes here go
// straight to seshat-server's real mcpregistry CRUD, the same store
// seshat-console's MCPServersPage.tsx edits, so a change made from Admin
// Console shows up there immediately and vice versa. Same shape as
// admin_provider_settings.go.

func (a *App) adminMCPServerConfigsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudmcp.Client, string, string, bool) {
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
	return cloudmcp.NewClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

type adminMCPServerConfigRequest struct {
	Name          string            `json:"name"`
	DisplayName   string            `json:"display_name"`
	ServerType    string            `json:"server_type"`
	Command       string            `json:"command"`
	Args          []string          `json:"args"`
	Env           map[string]string `json:"env"`
	URL           string            `json:"url"`
	Headers       map[string]string `json:"headers"`
	TimeoutSecs   int               `json:"timeout_secs"`
	Icon          string            `json:"icon"`
	ConnectorKind string            `json:"connector_kind"`
}

// handleAdminMCPServerConfigs — GET/POST /api/v1/admin/mcp-server-configs
func (a *App) handleAdminMCPServerConfigs(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.adminMCPServerConfigsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		configs, err := client.ListServerConfigs(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"mcp_server_configs": configs, "count": len(configs)})
	case http.MethodPost:
		var req adminMCPServerConfigRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		config, err := client.CreateServerConfig(r.Context(), token, cloudmcp.CreateServerConfigParams{
			OrganizationID: organizationID, Name: req.Name, DisplayName: req.DisplayName, ServerType: req.ServerType,
			Command: req.Command, Args: req.Args, Env: req.Env, URL: req.URL, Headers: req.Headers,
			TimeoutSecs: req.TimeoutSecs, Icon: req.Icon, ConnectorKind: req.ConnectorKind,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, config)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAdminMCPServerConfigDispatch — PUT/DELETE /api/v1/admin/mcp-server-configs/{id}
func (a *App) handleAdminMCPServerConfigDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.adminMCPServerConfigsClientForRequest(w, r)
	if !ok {
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/mcp-server-configs/"), "/")
	if id == "" {
		writeJSONError(w, http.StatusNotFound, "mcp server config id is required")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req adminMCPServerConfigRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		config, err := client.UpdateServerConfig(r.Context(), token, id, cloudmcp.UpdateServerConfigParams{
			DisplayName: req.DisplayName, ServerType: req.ServerType, Command: req.Command, Args: req.Args,
			Env: req.Env, URL: req.URL, Headers: req.Headers, TimeoutSecs: req.TimeoutSecs, Icon: req.Icon,
			ConnectorKind: req.ConnectorKind,
		})
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, config)

	case http.MethodDelete:
		if err := client.DeleteServerConfig(r.Context(), token, id); err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
