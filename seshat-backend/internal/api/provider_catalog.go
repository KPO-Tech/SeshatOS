package api

import (
	"net/http"

	bksettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
)

type providerCatalogEntryResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	AuthType    string   `json:"auth_type"`
	KeyEnvVars  []string `json:"key_env_vars,omitempty"`
	// BaseURL is the address the catalog gives for a generic provider; empty for a built-in provider.
	BaseURL    string `json:"base_url,omitempty"`
	ModelCount int    `json:"model_count"`
	// Unverified is true for a provider only a downloaded catalog knows: the user must confirm its base URL before a key is sent.
	Unverified bool `json:"unverified,omitempty"`
}

// handleProviderCatalog serves GET /settings/providers/catalog: the providers a user can set up, in two lists.
//
//	main: the providers built into the runtime, in its order (the desktop lists them first)
//	more: the generic providers of the models.dev catalog, sorted by name (offered behind "More providers", and found by search)
//
// Most of the providers of "more" have not been tried with a real key; the desktop says so.
func (a *App) handleProviderCatalog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	main := []providerCatalogEntryResponse{}
	more := []providerCatalogEntryResponse{}
	for _, e := range bksettings.Catalog() {
		item := providerCatalogEntryResponse{
			ID: e.ID, Name: e.Name, Description: e.Description, AuthType: e.AuthType, KeyEnvVars: e.KeyEnvVars,
			BaseURL: e.BaseURL, ModelCount: e.ModelCount, Unverified: e.Unverified,
		}
		if e.Main {
			main = append(main, item)
		} else {
			more = append(more, item)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"main":       main,
		"more":       more,
		"main_count": len(main),
		"more_count": len(more),
	})
}
