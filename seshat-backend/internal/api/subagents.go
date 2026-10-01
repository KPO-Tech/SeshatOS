package api

import (
	"net/http"
	"strings"
)

// handleSubagentCancel handles:
//
//	POST /api/v1/subagents/{agent_id}/cancel
//	body: {"session_id": "..."}
//
// Cancels a running background sub-agent spawned via the spawn_agent tool.
// The caller must name the session that spawned it — see
// query.Service.CancelSubagent for why that check exists.
func (app *App) handleSubagentCancel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok || principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	rest := strings.TrimPrefix(r.URL.Path, "/subagents/")
	agentID, action, found := strings.Cut(rest, "/")
	if !found || action != "cancel" || strings.TrimSpace(agentID) == "" {
		writeJSONError(w, http.StatusNotFound, "not found")
		return
	}

	var body struct {
		SessionID string `json:"session_id"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}

	if err := app.backend.Query.CancelSubagent(r.Context(), principal, strings.TrimSpace(body.SessionID), agentID); err != nil {
		writeBackendError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
