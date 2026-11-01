package api

import (
	"net/http"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/gitstate"
)

// handleGitState handles POST /git/state: the branch a folder is on and whether it holds uncommitted changes. It only reads.
func (a *App) handleGitState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		WorkspacePath string `json:"workspace_path"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	writeJSON(w, http.StatusOK, gitstate.Inspect(r.Context(), body.WorkspacePath))
}
