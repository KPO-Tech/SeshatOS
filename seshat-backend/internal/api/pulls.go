package api

import (
	"net/http"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/pulls"
)

// handlePullsTrack handles POST /pulls/track: the pull requests of the session (its folder and the addresses its tools printed) and
// the person's own, five at most, with the state of their checks. It reads GitHub and writes nothing.
func (a *App) handlePullsTrack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req pulls.Request
	if !decodeJSONBody(w, r, &req) {
		return
	}
	if len(req.URLs) > 20 {
		req.URLs = req.URLs[:20]
	}
	writeJSON(w, http.StatusOK, a.backend.Pulls.Track(r.Context(), req))
}
