package api

import (
	"net/http"

	localconnectors "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector/local"
)

type localConnectorToolResponse struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type localConnectorResponse struct {
	Kind            string                       `json:"kind"`
	Label           string                       `json:"label"`
	Description     string                       `json:"description"`
	Category        string                       `json:"category"`
	CredentialLabel string                       `json:"credential_label"`
	CredentialURL   string                       `json:"credential_url,omitempty"`
	DocsURL         string                       `json:"docs_url,omitempty"`
	Status          string                       `json:"status"`
	LastError       string                       `json:"last_error,omitempty"`
	Tools           []localConnectorToolResponse `json:"tools"`
}

func localConnectorToResponse(entry localconnectors.Entry) localConnectorResponse {
	tools := make([]localConnectorToolResponse, 0, len(entry.Tools))
	for _, tool := range entry.Tools {
		tools = append(tools, localConnectorToolResponse{Name: tool.Name, Description: tool.Description})
	}
	d := entry.Definition
	return localConnectorResponse{
		Kind: string(d.Kind), Label: d.Label, Description: d.Description, Category: d.Category,
		CredentialLabel: d.CredentialLabel, CredentialURL: d.CredentialURL, DocsURL: d.DocsURL,
		Status: entry.Status, LastError: entry.LastError, Tools: tools,
	}
}

// handleLocalConnectorCatalog serves GET /connectors/catalog: the connectors a person can connect on this machine, with where each
// stands. The backend owns the list, so the desktop offers nothing the backend cannot connect.
func (a *App) handleLocalConnectorCatalog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if a.backend.LocalConnectors == nil {
		// Connected to an organization server: its own connectors apply, the local catalog does not.
		writeJSON(w, http.StatusOK, map[string]any{"connectors": []localConnectorResponse{}, "count": 0})
		return
	}
	entries := a.backend.LocalConnectors.List(r.Context())
	items := make([]localConnectorResponse, 0, len(entries))
	for _, entry := range entries {
		items = append(items, localConnectorToResponse(entry))
	}
	writeJSON(w, http.StatusOK, map[string]any{"connectors": items, "count": len(items)})
}

type connectLocalConnectorRequest struct {
	Key string `json:"key"`
}

// handleLocalConnectorConnection handles /connectors/{kind}/connection: PUT connects with the person's key, DELETE forgets it.
func (a *App) handleLocalConnectorConnection(w http.ResponseWriter, r *http.Request, kind string) {
	if a.backend.LocalConnectors == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "local connectors are not available")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req connectLocalConnectorRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		entry, err := a.backend.LocalConnectors.Connect(r.Context(), principal.User.ID, kind, req.Key)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, localConnectorToResponse(entry))
	case http.MethodDelete:
		if err := a.backend.LocalConnectors.Disconnect(r.Context(), principal.User.ID, kind); err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
