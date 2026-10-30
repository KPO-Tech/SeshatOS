package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	bksettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
)

// handleProviderKeyCheck handles POST /settings/providers/check-key. It asks the provider whether it accepts a key before anything is
// saved, so a wrong key is told to the person instead of failing at their first message. It writes nothing.
func (a *App) handleProviderKeyCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Provider string `json:"provider"`
		APIKey   string `json:"api_key"`
		BaseURL  string `json:"base_url"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Provider) == "" {
		writeJSONError(w, http.StatusBadRequest, "provider is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	writeJSON(w, http.StatusOK, bksettings.CheckProviderKey(ctx, &http.Client{Timeout: 10 * time.Second}, body.Provider, body.BaseURL, strings.TrimSpace(body.APIKey)))
}
