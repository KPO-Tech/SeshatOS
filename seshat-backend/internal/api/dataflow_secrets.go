package api

import (
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// handleDataflowSecrets — GET/POST /api/v1/settings/dataflow-secrets. Local,
// single-user store (see internal/dataflowsecrets) — no organization
// scoping needed, unlike seshat-server's counterpart. POST overwrites an
// existing name (no separate PUT/delete-then-recreate ceremony — see
// dataflowsecrets.Service.Set's doc comment).
func (a *App) handleDataflowSecrets(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if a.dataflowSecrets == nil {
		writeBackendError(w, bkerr.Unavailable("dataflow secrets store not available", nil))
		return
	}

	switch r.Method {
	case http.MethodGet:
		names, err := a.dataflowSecrets.List(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to list dataflow secrets", err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"names": names, "count": len(names)})

	case http.MethodPost:
		var body struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if err := a.dataflowSecrets.Set(r.Context(), body.Name, body.Value); err != nil {
			writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"name": strings.TrimSpace(body.Name)})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleDataflowSecretByName — DELETE /api/v1/settings/dataflow-secrets/{name}.
func (a *App) handleDataflowSecretByName(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if a.dataflowSecrets == nil {
		writeBackendError(w, bkerr.Unavailable("dataflow secrets store not available", nil))
		return
	}
	name := strings.TrimSpace(r.PathValue("name"))
	if name == "" {
		writeBackendError(w, bkerr.InvalidInput("missing secret name", nil))
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := a.dataflowSecrets.Delete(r.Context(), name); err != nil {
		writeBackendError(w, bkerr.Internal("failed to delete dataflow secret", err))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
