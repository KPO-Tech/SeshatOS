package api

import (
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/types"
)

// handleSessions handles GET /api/v1/sessions (list) and POST /api/v1/sessions (create).
func (app *App) handleSessions(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		sessions, err := app.backend.Query.ListSessions(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions, "count": len(sessions)})

	case http.MethodPost:
		var req createSessionRequest
		if r.Body != nil {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
				writeJSONError(w, http.StatusBadRequest, "invalid request body")
				return
			}
		}
		permissionMode, executionOrigin, err := app.backend.Query.ResolvePolicyFromRequest(r.Context(), principal, "", req.PermissionMode, req.ExecutionOrigin)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		sessionID, err := app.backend.Query.CreateSession(r.Context(), principal, req.ProviderSettingID, req.ModelID, permissionMode, executionOrigin, req.Source)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"session_id": sessionID})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleSessionSearch handles GET /api/v1/sessions/search?q=...
func (app *App) handleSessionSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	principal, _ := authPrincipalFromContext(r.Context())
	queryText := strings.TrimSpace(r.URL.Query().Get("q"))
	if queryText == "" {
		writeJSON(w, http.StatusOK, map[string]any{"results": []sessionSearchResult{}, "count": 0})
		return
	}

	// Step 1: title matches via a single SQL LIKE — zero N+1 for this path.
	const maxTitleResults = 200
	titleMatches, err := app.backend.Query.SearchSessionsByTitle(r.Context(), principal, queryText, maxTitleResults)
	if err != nil {
		writeBackendError(w, err)
		return
	}

	results := make([]sessionSearchResult, 0, len(titleMatches))
	seen := make(map[string]struct{}, len(titleMatches))
	for _, s := range titleMatches {
		results = append(results, sessionSearchResult{
			SessionID: s.SessionID,
			Title:     s.Title,
			Preview:   "",
			CreatedAt: s.CreatedAt,
			UpdatedAt: s.UpdatedAt,
		})
		seen[s.SessionID] = struct{}{}
	}

	// Step 2: content search via backend SQL LIKE — single query, no N+1.
	const maxContentResults = 20
	contentMatches, _ := app.backend.Query.SearchSessionsByContent(r.Context(), principal, queryText, maxContentResults)
	for _, s := range contentMatches {
		if _, alreadyFound := seen[s.SessionID]; alreadyFound {
			continue
		}
		results = append(results, sessionSearchResult{
			SessionID: s.SessionID,
			Title:     s.Title,
			CreatedAt: s.CreatedAt,
			UpdatedAt: s.UpdatedAt,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].UpdatedAt > results[j].UpdatedAt
	})
	writeJSON(w, http.StatusOK, map[string]any{"results": results, "count": len(results)})
}

// handleSessionByID handles:
//   - GET          /api/v1/sessions/{id}
//   - PATCH / PUT  /api/v1/sessions/{id}
//   - DELETE       /api/v1/sessions/{id}
//   - POST         /api/v1/sessions/{id}/interrupt
func (app *App) handleSessionByID(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	trimmed := strings.Trim(strings.TrimPrefix(r.URL.Path, "/sessions/"), "/")
	parts := strings.Split(trimmed, "/")
	sessionID := parts[0]
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	if action == "interrupt" {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := app.backend.Query.InterruptSession(r.Context(), principal, sessionID); err != nil {
			writeBackendError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if action == "files" {
		app.handleSessionFiles(w, r, principal, sessionID)
		return
	}

	switch r.Method {
	case http.MethodGet:
		detail, err := app.backend.Query.GetSession(r.Context(), principal, sessionID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, withDecoratedMessages(r.Context(), app.backend.Files, sessionID, detail))

	case http.MethodPatch, http.MethodPut:
		var req updateSessionRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		var permissionMode *types.PermissionMode
		if req.PermissionMode != nil {
			trimmed := strings.TrimSpace(*req.PermissionMode)
			mode, ok := types.NormalizePermissionMode(trimmed)
			if !ok {
				writeJSONError(w, http.StatusBadRequest, "invalid permission_mode")
				return
			}
			permissionMode = &mode
		}
		var executionOrigin *types.ExecutionOrigin
		if req.ExecutionOrigin != nil {
			origin := types.NormalizeExecutionOrigin(*req.ExecutionOrigin)
			executionOrigin = &origin
		}
		if req.Title != nil && len(*req.Title) > 512 {
			writeJSONError(w, http.StatusBadRequest, "title exceeds maximum length (512 chars)")
			return
		}
		var providerSettingID *string
		if req.ProviderSettingID != nil && strings.TrimSpace(*req.ProviderSettingID) != "" {
			v := strings.TrimSpace(*req.ProviderSettingID)
			providerSettingID = &v
		}
		var modelID *string
		if req.ModelID != nil {
			v := strings.TrimSpace(*req.ModelID)
			modelID = &v
		}
		var workspacePath *string
		if req.WorkspacePath != nil {
			v := strings.TrimSpace(*req.WorkspacePath)
			workspacePath = &v
		}
		var projectPath *string
		if req.ProjectPath != nil {
			v := strings.TrimSpace(*req.ProjectPath)
			projectPath = &v
		}
		var executionMode *string
		if req.ExecutionMode != nil {
			v := strings.TrimSpace(*req.ExecutionMode)
			executionMode = &v
		}
		if err := app.backend.Query.UpdateSessionMetadata(r.Context(), principal, sessionID, req.Title, permissionMode, executionOrigin, providerSettingID, modelID, workspacePath, projectPath, executionMode); err != nil {
			writeBackendError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	case http.MethodDelete:
		if err := app.backend.Query.DeleteSession(r.Context(), principal, sessionID); err != nil {
			writeBackendError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
