package api

import (
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

// Dataflow secrets — org-scoped named values a graph node's *SecretRef
// parameter resolves by name at run time (a Postgres node's dsnSecretRef,
// etc.). Proxies seshat-server's /api/v1/dataflow-secrets with the caller's
// own session token, same reasoning as every other handler in this file: no
// extra role gate here, seshat-server's own dataflow_secrets.manage/.read
// permission check is the real gate (empty list on read-denied, 403 on
// write-denied, exactly like jobs.manage already behaves for jobs).

// handleAutomationDataflowSecrets — GET/POST /api/v1/automation/dataflow-secrets
func (a *App) handleAutomationDataflowSecrets(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		secrets, err := client.ListDataflowSecrets(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"dataflow_secrets": secrets, "count": len(secrets)})
	case http.MethodPost:
		var req struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		}
		if !decodeJSONBody(w, r, &req) {
			return
		}
		secret, err := client.CreateDataflowSecret(r.Context(), token, organizationID, req.Name, req.Value)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, secret)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAutomationDataflowSecretDispatch — DELETE /api/v1/automation/dataflow-secrets/{id}
func (a *App) handleAutomationDataflowSecretDispatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, _, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/automation/dataflow-secrets/"), "/")
	if id == "" {
		writeJSONError(w, http.StatusNotFound, "dataflow secret id is required")
		return
	}
	if err := client.DeleteDataflowSecret(r.Context(), token, id); err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
