package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/automation"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// Variables — org-scoped $vars.NAME values graph nodes can reference.
// Proxies seshat-server's /api/v1/variables with the caller's own session
// token, same reasoning as every other handler in this file: no extra role
// gate here, seshat-server's own permission check is the real gate.

// handleAutomationVariables — GET/POST /api/v1/automation/variables
func (a *App) handleAutomationVariables(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		variables, err := client.ListVariables(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"variables": variables, "count": len(variables)})
	case http.MethodPost:
		var req struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		variable, err := client.CreateVariable(r.Context(), token, organizationID, req.Name, req.Value)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, variable)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAutomationVariableDispatch — PUT/DELETE /api/v1/automation/variables/{id}
func (a *App) handleAutomationVariableDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/automation/variables/"), "/")
	if id == "" {
		writeJSONError(w, http.StatusNotFound, "variable id is required")
		return
	}
	switch r.Method {
	case http.MethodPut:
		var req struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		variable, err := client.UpdateVariable(r.Context(), token, id, req.Name, req.Value)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, variable)
	case http.MethodDelete:
		if err := client.DeleteVariable(r.Context(), token, id); err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAutomationDataflowTemplates — GET /api/v1/automation/dataflow/templates
func (a *App) handleAutomationDataflowTemplates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, _, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	templates, err := client.ListTemplates(r.Context(), token)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"templates": templates, "count": len(templates)})
}

// Graph editor "live testing" endpoints - preview-expression (Insert Data
// picker), test-connection (a node's Test Connection button), test-run
// (Test Step/Run Workflow). Raw JSON passthrough: see JobsClient.
// postDataflowRaw's doc comment for why these aren't given typed request/
// response DTOs here like Job/Variable/Template are.

// handleAutomationDataflowPreviewExpression — POST /api/v1/automation/dataflow/preview-expression
func (a *App) handleAutomationDataflowPreviewExpression(w http.ResponseWriter, r *http.Request) {
	a.proxyDataflowRaw(w, r, (*cloudautomation.JobsClient).PreviewExpression)
}

// handleAutomationDataflowTestConnection — POST /api/v1/automation/dataflow/test-connection
func (a *App) handleAutomationDataflowTestConnection(w http.ResponseWriter, r *http.Request) {
	a.proxyDataflowRaw(w, r, (*cloudautomation.JobsClient).TestConnection)
}

// handleAutomationDataflowTestRun — POST /api/v1/automation/dataflow/test-run
func (a *App) handleAutomationDataflowTestRun(w http.ResponseWriter, r *http.Request) {
	a.proxyDataflowRaw(w, r, (*cloudautomation.JobsClient).TestRunGraph)
}

func (a *App) proxyDataflowRaw(w http.ResponseWriter, r *http.Request, call func(*cloudautomation.JobsClient, context.Context, string, json.RawMessage) (json.RawMessage, error)) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, _, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	var body json.RawMessage
	if !decodeJSONBody(w, r, &body) {
		return
	}
	out, err := call(client, r.Context(), token, body)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(out)
}
