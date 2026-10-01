package api

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	backendmcp "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/mcp"
	"github.com/KPO-Tech/seshat/pkg/mcp"
	"github.com/KPO-Tech/seshat/pkg/runtimepath"
)

// DefaultMCPJsonPath returns the canonical path for the local MCP JSON config.
func DefaultMCPJsonPath() string {
	return runtimepath.Join("", "mcp.json")
}

// handleMCPConfigDispatch routes /mcp/config/* sub-paths.
func (a *App) handleMCPConfigDispatch(w http.ResponseWriter, r *http.Request) {
	// strip leading /mcp/config/
	trimmed := strings.TrimPrefix(r.URL.Path, "/mcp/config/")
	trimmed = strings.Trim(trimmed, "/")
	if trimmed == "import-json" {
		a.handleMCPImportJSON(w, r)
		return
	}
	// everything else is treated as an {id} path
	a.handleMCPConfigByID(w, r)
}

type mcpServerResponse struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	DisplayName string            `json:"display_name"`
	ServerType  string            `json:"server_type"`
	Command     string            `json:"command,omitempty"`
	Args        []string          `json:"args,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	URL         string            `json:"url,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	TimeoutSecs int               `json:"timeout_secs"`
	Icon        string            `json:"icon"`
	Enabled     bool              `json:"enabled"`
	Source      string            `json:"source"`
	CreatedAt   int64             `json:"created_at"`
	UpdatedAt   int64             `json:"updated_at"`
}

const redactedSecretValue = "<redacted>"

func mcpServerToResponse(s backendmcp.Server) mcpServerResponse {
	return mcpServerResponse{
		ID:          s.ID,
		Name:        s.Name,
		DisplayName: s.DisplayName,
		ServerType:  s.ServerType,
		Command:     s.Command,
		Args:        s.Args,
		Env:         redactSecretMap(s.Env),
		URL:         s.URL,
		Headers:     redactSecretMap(s.Headers),
		TimeoutSecs: s.TimeoutSecs,
		Icon:        s.Icon,
		Enabled:     s.Enabled,
		Source:      s.Source,
		CreatedAt:   s.CreatedAt.Unix(),
		UpdatedAt:   s.UpdatedAt.Unix(),
	}
}

func redactSecretMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return values
	}
	out := make(map[string]string, len(values))
	for key, value := range values {
		if strings.TrimSpace(value) == "" {
			out[key] = value
			continue
		}
		if looksSensitiveSecretKey(key) {
			out[key] = redactedSecretValue
			continue
		}
		out[key] = value
	}
	return out
}

func mergeRedactedSecretMap(existing, incoming map[string]string) map[string]string {
	if incoming == nil {
		return nil
	}
	merged := make(map[string]string, len(incoming))
	for key, value := range incoming {
		if value == redactedSecretValue && looksSensitiveSecretKey(key) {
			if existingValue, ok := existing[key]; ok {
				merged[key] = existingValue
				continue
			}
		}
		merged[key] = value
	}
	return merged
}

func looksSensitiveSecretKey(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	if normalized == "authorization" || normalized == "cookie" || normalized == "set-cookie" {
		return true
	}
	for _, marker := range []string{"token", "secret", "password", "apikey", "api_key", "auth", "bearer", "cookie", "session", "credential"} {
		if strings.Contains(normalized, marker) {
			return true
		}
	}
	return false
}

// GET  /api/v1/mcp/config        — list all servers
// POST /api/v1/mcp/config        — create server
func (a *App) handleMCPConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		servers, err := a.backend.MCP.List(r.Context())
		if err != nil {
			writeBackendError(w, err)
			return
		}
		resp := make([]mcpServerResponse, 0, len(servers))
		for _, s := range servers {
			resp = append(resp, mcpServerToResponse(s))
		}
		writeJSON(w, http.StatusOK, map[string]any{"servers": resp, "count": len(resp)})

	case http.MethodPost:
		var body struct {
			Name        string            `json:"name"`
			DisplayName string            `json:"display_name"`
			ServerType  string            `json:"server_type"`
			Command     string            `json:"command"`
			Args        []string          `json:"args"`
			Env         map[string]string `json:"env"`
			URL         string            `json:"url"`
			Headers     map[string]string `json:"headers"`
			TimeoutSecs int               `json:"timeout_secs"`
			Icon        string            `json:"icon"`
			Enabled     bool              `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if strings.TrimSpace(body.Name) == "" {
			writeJSONError(w, http.StatusBadRequest, "name is required")
			return
		}
		created, err := a.backend.MCP.Create(r.Context(), backendmcp.CreateParams{
			Name:        body.Name,
			DisplayName: body.DisplayName,
			ServerType:  body.ServerType,
			Command:     body.Command,
			Args:        body.Args,
			Env:         body.Env,
			URL:         body.URL,
			Headers:     body.Headers,
			TimeoutSecs: body.TimeoutSecs,
			Icon:        body.Icon,
			Enabled:     body.Enabled,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, mcpServerToResponse(*created))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// PUT    /api/v1/mcp/config/{id}   — update server
// DELETE /api/v1/mcp/config/{id}   — delete server
func (a *App) handleMCPConfigByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, "/mcp/config/"), "mcp/config/")
	id = strings.Trim(id, "/")

	switch r.Method {
	case http.MethodPut:
		var body struct {
			DisplayName *string           `json:"display_name"`
			ServerType  *string           `json:"server_type"`
			Command     *string           `json:"command"`
			Args        []string          `json:"args"`
			Env         map[string]string `json:"env"`
			URL         *string           `json:"url"`
			Headers     map[string]string `json:"headers"`
			TimeoutSecs *int              `json:"timeout_secs"`
			Icon        *string           `json:"icon"`
			Enabled     *bool             `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		existing, err := a.backend.MCP.GetByID(r.Context(), id)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		updated, err := a.backend.MCP.Update(r.Context(), id, backendmcp.UpdateParams{
			DisplayName: body.DisplayName,
			ServerType:  body.ServerType,
			Command:     body.Command,
			Args:        body.Args,
			Env:         mergeRedactedSecretMap(existing.Env, body.Env),
			URL:         body.URL,
			Headers:     mergeRedactedSecretMap(existing.Headers, body.Headers),
			TimeoutSecs: body.TimeoutSecs,
			Icon:        body.Icon,
			Enabled:     body.Enabled,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, mcpServerToResponse(*updated))

	case http.MethodDelete:
		if err := a.backend.MCP.Delete(r.Context(), id); err != nil {
			writeBackendError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// POST /api/v1/mcp/config/import-json
// Body: { "servers": { "name": { "type": "...", "command": "..." } } }
// OR empty body → loads from ~/.config/seshat/mcp.json
func (a *App) handleMCPImportJSON(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var cfg mcp.McpJsonConfig

	if r.ContentLength > 0 {
		// Frontend sent parsed JSON
		if !decodeJSONBody(w, r, &cfg) {
			return
		}
	} else {
		// Load from default config path on server
		path := DefaultMCPJsonPath()
		if _, err := os.Stat(path); os.IsNotExist(err) {
			writeJSONError(w, http.StatusNotFound, fmt.Sprintf("no mcp.json found at %s", path))
			return
		}
		var errs []mcp.ValidationError
		cfg, errs = mcp.ParseMcpConfigFromFile(path)
		if len(errs) > 0 {
			writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("parse error: %s", errs[0].Message))
			return
		}
	}

	count, err := a.backend.MCP.ImportFromMcpJSON(r.Context(), cfg)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"imported": count,
		"message":  fmt.Sprintf("%d server(s) imported/updated", count),
	})
}

// POST /api/v1/mcp/reload
// Re-imports mcp.json into DB (idempotent), then reloads all enabled servers into the SDK runtime.
func (a *App) handleMCPReload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	path := DefaultMCPJsonPath()
	if _, err := os.Stat(path); err == nil {
		if cfg, errs := mcp.ParseMcpConfigFromFile(path); len(errs) == 0 && len(cfg.MCPServers) > 0 {
			_, _ = a.backend.MCP.ImportFromMcpJSON(r.Context(), cfg)
		}
	}
	statuses, err := a.backend.MCP.Reload(r.Context(), requestToken(r), requestOrganizationID(r))
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"reloaded": len(statuses),
		"servers":  toMCPStatusResponse(statuses),
	})
}

// GET /api/v1/mcp
// Returns the current connection status of all MCP servers from the SDK runtime.
func (a *App) handleMCPList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	statuses := a.backend.MCP.Status()
	writeJSON(w, http.StatusOK, map[string]any{
		"servers": toMCPStatusResponse(statuses),
		"count":   len(statuses),
	})
}

type mcpStatusResponse struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Error  string `json:"error,omitempty"`
	Tools  int    `json:"tools"`
	Source string `json:"source,omitempty"`
}

func toMCPStatusResponse(statuses []backendmcp.ServerStatus) []mcpStatusResponse {
	out := make([]mcpStatusResponse, 0, len(statuses))
	for _, s := range statuses {
		out = append(out, mcpStatusResponse{Name: s.Name, OK: s.OK, Error: s.Error, Tools: s.Tools, Source: s.Source})
	}
	return out
}

// requestToken returns the calling principal's session token, or "" if
// there is none (standalone mode or a missing principal) — used to resolve
// a connected org's MCP catalog on behalf of the request.
func requestToken(r *http.Request) string {
	if principal, ok := authPrincipalFromContext(r.Context()); ok {
		return principal.AuthSession.ID
	}
	return ""
}

// requestOrganizationID returns the calling principal's own organization
// (see auth.Principal.OrganizationID), or "" if there is none - resolved
// fresh per request rather than from any deployment-time configuration,
// since seshat-server enforces at most one organization per user account.
func requestOrganizationID(r *http.Request) string {
	if principal, ok := authPrincipalFromContext(r.Context()); ok {
		return principal.OrganizationID()
	}
	return ""
}

// mcpRoute wraps an admin-gated MCP handler and, for handlers that don't
// already reload the runtime themselves, calls MCP.NoteRequestToken so the
// first authenticated MCP request after a restart resumes any approved org
// servers automatically. reloadsItself must be true for handlers that call
// Reload/ApproveOrgServer/RevokeOrgServerApproval directly (handleMCPReload,
// handleMCPOrgCatalogApprove) — calling NoteRequestToken for those too would
// trigger a redundant second reload. Centralizing this check here, at the
// single place every MCP route is registered (see routes.go), replaces a
// per-handler call that was easy to forget — and had in fact been forgotten
// for handleMCPTools.
func (a *App) mcpRoute(handler http.HandlerFunc, reloadsItself bool) http.Handler {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !reloadsItself {
			a.backend.MCP.NoteRequestToken(r.Context(), requestToken(r), requestOrganizationID(r))
		}
		handler(w, r)
	})
	if a.connectedServerURL == "" {
		return a.authMiddleware(inner)
	}
	return a.requireRole("admin", inner)
}

type mcpOrgCatalogEntryResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	DisplayName string   `json:"display_name,omitempty"`
	ServerType  string   `json:"server_type"`
	Command     string   `json:"command,omitempty"`
	Args        []string `json:"args,omitempty"`
	URL         string   `json:"url,omitempty"`
	Icon        string   `json:"icon,omitempty"`
	Approved    bool     `json:"approved"`
}

func toMCPOrgCatalogResponse(entries []backendmcp.OrgServerStatus) []mcpOrgCatalogEntryResponse {
	out := make([]mcpOrgCatalogEntryResponse, 0, len(entries))
	for _, e := range entries {
		out = append(out, mcpOrgCatalogEntryResponse{
			ID: e.ID, Name: e.Name, DisplayName: e.DisplayName, ServerType: e.ServerType,
			Command: e.Command, Args: e.Args, URL: e.URL, Icon: e.Icon, Approved: e.Approved,
		})
	}
	return out
}

// GET /api/v1/mcp/org-catalog
// Returns the connected org's shared MCP server catalog, cross-referenced
// with this installation's local approval state. Empty list in standalone
// mode or on any network failure — this is enrichment, not a hard
// dependency (see backendmcp.Service.ListOrgCatalog).
func (a *App) handleMCPOrgCatalog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	entries, err := a.backend.MCP.ListOrgCatalog(r.Context(), requestToken(r), requestOrganizationID(r))
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"mcp_org_catalog": toMCPOrgCatalogResponse(entries),
		"count":           len(entries),
	})
}

// POST   /api/v1/mcp/org-catalog/{orgServerID}/approve — approve and reload
// DELETE /api/v1/mcp/org-catalog/{orgServerID}/approve — revoke and reload
func (a *App) handleMCPOrgCatalogApprove(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/mcp/org-catalog/")
	trimmed = strings.TrimSuffix(strings.Trim(trimmed, "/"), "/approve")
	orgServerID := strings.Trim(trimmed, "/")
	if orgServerID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing org server id")
		return
	}
	switch r.Method {
	case http.MethodPost:
		statuses, err := a.backend.MCP.ApproveOrgServer(r.Context(), orgServerID, requestToken(r), requestOrganizationID(r))
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"servers": toMCPStatusResponse(statuses)})
	case http.MethodDelete:
		statuses, err := a.backend.MCP.RevokeOrgServerApproval(r.Context(), orgServerID, requestToken(r), requestOrganizationID(r))
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"servers": toMCPStatusResponse(statuses)})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// GET /api/v1/mcp/tools
// Returns connected tools grouped by server name, with name and description.
func (a *App) handleMCPTools(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	byServer := a.backend.MCP.ToolsByServer()
	type toolEntry struct {
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
	}
	out := make(map[string][]toolEntry, len(byServer))
	for server, tools := range byServer {
		entries := make([]toolEntry, 0, len(tools))
		for _, t := range tools {
			entries = append(entries, toolEntry{Name: t.Name, Description: t.Description})
		}
		out[server] = entries
	}
	writeJSON(w, http.StatusOK, map[string]any{"tools": out})
}
