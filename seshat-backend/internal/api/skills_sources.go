package api

import (
	"net/http"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

type skillSourcesRequest struct {
	Folders   []string            `json:"folders"`
	Selection map[string][]string `json:"selection"`
}

type skillSourceScanRequest struct {
	Source string `json:"source"`
}

// GET /api/v1/skills/sources: the skill folders of other tools and the folders the person added, with what each holds and how much
// of it the agent uses.
// PUT /api/v1/skills/sources: stores the folders (when given) and the skills the person validated. Selection is merged by source: a
// source present in the body gets exactly the names listed (an empty list stops using it), the others are left as they were. Nothing
// is imported until a source is validated; what is validated is read in place, never copied.
func (a *App) handleSkillSources(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, a.backend.Skills.SourcesView())
	case http.MethodPut:
		var req skillSourcesRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		cfg := a.backend.Skills.LoadSources()
		if req.Folders != nil {
			cfg.Folders = req.Folders
		}
		if cfg.Selection == nil {
			cfg.Selection = map[string][]string{}
		}
		for source, names := range req.Selection {
			cfg.Selection[source] = names
		}
		if _, err := a.backend.Skills.SaveSources(cfg); err != nil {
			writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
			return
		}
		writeJSON(w, http.StatusOK, a.backend.Skills.SourcesView())
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// POST /api/v1/skills/sources/scan {"source": "claude_code" | "codex" | <path of an added folder>}: lists what the source holds, for
// the person to review. Reads only: nothing changes until they validate.
func (a *App) handleSkillSourceScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req skillSourceScanRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	result, err := a.backend.Skills.Scan(req.Source)
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}
	writeJSON(w, http.StatusOK, result)
}
