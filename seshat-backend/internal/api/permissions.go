package api

import (
	"net/http"
	"strings"

	backendplans "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/plans"
	backendquery "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/query"
	"github.com/KPO-Tech/seshat/pkg/types"
)

func (app *App) handlePermissionDecision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok || principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	toolUseID := strings.TrimPrefix(r.URL.Path, "/permissions/")
	if toolUseID == "" {
		writeJSONError(w, http.StatusBadRequest, "tool_use_id is required")
		return
	}
	var body struct {
		Approved  bool   `json:"approved"`
		SessionID string `json:"session_id"`
		Reason    string `json:"reason"`
		// Remember, when true alongside Approved, persists this approval for
		// the rest of the session ("Always Allow" instead of "Allow once") -
		// see broker.go's PermissionDecision doc comment for how this reaches
		// the permission engine.
		Remember bool `json:"remember"`
		// PlanID, when set, is a plan-review decision (approving/denying
		// exit_plan_mode) rather than a generic tool permission - see the
		// status-sync comment below.
		PlanID string `json:"plan_id"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if app.permBroker == nil {
		writeJSONError(w, http.StatusNotFound, "no pending permission for this tool_use_id")
		return
	}
	sessionID := strings.TrimSpace(body.SessionID)
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "session_id is required")
		return
	}
	switch app.permBroker.Resolve(toolUseID, principal.User.ID, sessionID, body.Approved, body.Remember, strings.TrimSpace(body.Reason)) {
	case backendquery.BrokerResolveResolved:
		// Sync the persisted plan_documents.status in the same request that
		// actually unblocks the agent, instead of the caller making two
		// separate calls (permission decision + PATCH /plans/:id) that can
		// diverge if the second one fails - the client used to close the
		// panel and move on believing both succeeded even when the status
		// write never landed. This runs after Resolve has already
		// succeeded, so a failure here can never leave the agent hung
		// waiting on a decision that was in fact made; it only means the
		// document's own status column is out of date, which is why it's
		// logged rather than turned into an error response.
		if planID := strings.TrimSpace(body.PlanID); planID != "" && app.backend != nil && app.backend.Plans != nil {
			status := "rejected"
			if body.Approved {
				status = "validated"
			}
			if _, err := app.backend.Plans.Patch(r.Context(), principal, planID, backendplans.PatchParams{Status: &status}); err != nil {
				logError(r, "sync plan %s status to %s after permission decision: %v", planID, status, err)
			}
		}
		w.WriteHeader(http.StatusNoContent)
	case backendquery.BrokerResolveForbidden:
		writeJSONError(w, http.StatusForbidden, "pending permission belongs to another user or session")
	default:
		writeJSONError(w, http.StatusNotFound, "no pending permission for this tool_use_id")
	}
}

func (app *App) handlePromptResponse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok || principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	promptID := strings.TrimPrefix(r.URL.Path, "/prompts/")
	if promptID == "" {
		writeJSONError(w, http.StatusBadRequest, "prompt_id is required")
		return
	}
	var body struct {
		Value     any            `json:"value"`
		Cancelled bool           `json:"cancelled"`
		Metadata  map[string]any `json:"metadata"`
		SessionID string         `json:"session_id"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if app.promptBroker == nil {
		writeJSONError(w, http.StatusNotFound, "no pending prompt for this prompt_id")
		return
	}
	sessionID := strings.TrimSpace(body.SessionID)
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "session_id is required")
		return
	}
	switch app.promptBroker.Resolve(promptID, principal.User.ID, sessionID, types.PromptResponse{
		Value:     body.Value,
		Cancelled: body.Cancelled,
		Metadata:  body.Metadata,
	}) {
	case backendquery.BrokerResolveResolved:
		w.WriteHeader(http.StatusNoContent)
	case backendquery.BrokerResolveForbidden:
		writeJSONError(w, http.StatusForbidden, "pending prompt belongs to another user or session")
	default:
		writeJSONError(w, http.StatusNotFound, "no pending prompt for this prompt_id")
	}
}
