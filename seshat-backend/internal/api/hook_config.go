package api

import (
	"net/http"
	"strings"
)

// hooksRoute mirrors mcpRoute exactly (see its doc comment): wraps an
// admin-gated hooks handler and, for handlers that don't already reload the
// runtime themselves, calls Hooks.NoteRequestToken so the first
// authenticated hooks request after a restart resumes any approved org
// hooks automatically.
func (a *App) hooksRoute(handler http.HandlerFunc, reloadsItself bool) http.Handler {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !reloadsItself {
			a.backend.Hooks.NoteRequestToken(r.Context(), requestToken(r), requestOrganizationID(r))
		}
		handler(w, r)
	})
	if a.connectedServerURL == "" {
		return a.authMiddleware(inner)
	}
	return a.requireRole("admin", inner)
}

type hookOrgCatalogEntryResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Matcher     string `json:"matcher,omitempty"`
	Command     string `json:"command"`
	TimeoutSecs int    `json:"timeout_secs"`
	Approved    bool   `json:"approved"`
}

// GET /api/v1/hooks/org-catalog
// Returns the connected org's shared hook catalog, cross-referenced with
// this installation's local approval state. Empty list in standalone mode
// or on any network failure - this is enrichment, not a hard dependency
// (see backendhooks.Service.ListOrgCatalog).
func (a *App) handleHooksOrgCatalog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	entries, err := a.backend.Hooks.ListOrgCatalog(r.Context(), requestToken(r), requestOrganizationID(r))
	if err != nil {
		writeBackendError(w, err)
		return
	}
	out := make([]hookOrgCatalogEntryResponse, 0, len(entries))
	for _, e := range entries {
		out = append(out, hookOrgCatalogEntryResponse{
			ID: e.ID, Name: e.Name, Matcher: e.Matcher, Command: e.Command,
			TimeoutSecs: e.TimeoutSecs, Approved: e.Approved,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"hook_org_catalog": out, "count": len(out)})
}

// POST   /api/v1/hooks/org-catalog/{orgHookID}/approve — approve and reload
// DELETE /api/v1/hooks/org-catalog/{orgHookID}/approve — revoke and reload
func (a *App) handleHooksOrgCatalogApprove(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/hooks/org-catalog/")
	trimmed = strings.TrimSuffix(strings.Trim(trimmed, "/"), "/approve")
	orgHookID := strings.Trim(trimmed, "/")
	if orgHookID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing org hook id")
		return
	}
	switch r.Method {
	case http.MethodPost:
		if err := a.backend.Hooks.ApproveOrgHook(r.Context(), orgHookID, requestToken(r), requestOrganizationID(r)); err != nil {
			writeBackendError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case http.MethodDelete:
		if err := a.backend.Hooks.RevokeOrgHookApproval(r.Context(), orgHookID, requestToken(r), requestOrganizationID(r)); err != nil {
			writeBackendError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
