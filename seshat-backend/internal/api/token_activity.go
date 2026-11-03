package api

import (
	"net/http"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// tokenActivityDays reaches back far enough to fill 53 weeks of columns.
const tokenActivityDays = 53 * 7

type tokenActivityDayResponse struct {
	Date         string `json:"date"`
	InputTokens  int64  `json:"input_tokens"`
	OutputTokens int64  `json:"output_tokens"`
	CacheTokens  int64  `json:"cache_tokens"`
}

type tokenActivityResponse struct {
	// Today is the backend's local date, the one the days are counted in.
	Today string                     `json:"today"`
	Days  []tokenActivityDayResponse `json:"days"`
}

// handleTokenActivity - GET /api/v1/account/token-activity. What the signed-in user spent,
// by local day, for the activity card in Settings > Account.
func (a *App) handleTokenActivity(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if a.tokenActivityStore == nil {
		writeBackendError(w, bkerr.Unavailable("token activity store not available", nil))
		return
	}
	if err := a.tokenActivityStore.CollectAll(r.Context()); err != nil {
		writeBackendError(w, bkerr.Internal("failed to count token activity", err))
		return
	}
	now := time.Now()
	days, err := a.tokenActivityStore.Since(r.Context(), principal.User.ID, now.AddDate(0, 0, -tokenActivityDays).Format(time.DateOnly))
	if err != nil {
		writeBackendError(w, bkerr.Internal("failed to read token activity", err))
		return
	}
	resp := tokenActivityResponse{Today: now.Format(time.DateOnly), Days: make([]tokenActivityDayResponse, 0, len(days))}
	for _, day := range days {
		resp.Days = append(resp.Days, tokenActivityDayResponse{
			Date:         day.Day,
			InputTokens:  day.InputTokens,
			OutputTokens: day.OutputTokens,
			CacheTokens:  day.CacheTokens,
		})
	}
	writeJSON(w, http.StatusOK, resp)
}
