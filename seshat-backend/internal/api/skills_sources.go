package api

import (
	"net/http"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	backendskills "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skills"
)

type skillSourcesRequest struct {
	ClaudeCode bool     `json:"claude_code"`
	Codex      bool     `json:"codex"`
	Folders    []string `json:"folders"`
}

// GET /api/v1/skills/sources: the skill folders of other tools and the folders the person added, with what each holds.
// PUT /api/v1/skills/sources: sets which of them the agent may use. They are read in place, never copied.
func (a *App) handleSkillSources(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, a.backend.Skills.SourcesView())
	case http.MethodPut:
		var req skillSourcesRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		if _, err := a.backend.Skills.SaveSources(backendskills.SourcesConfig{ClaudeCode: req.ClaudeCode, Codex: req.Codex, Folders: req.Folders}); err != nil {
			writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
			return
		}
		writeJSON(w, http.StatusOK, a.backend.Skills.SourcesView())
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
