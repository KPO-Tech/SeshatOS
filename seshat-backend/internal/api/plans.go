package api

import (
	"net/http"
	"strings"

	backendplans "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/plans"
)

// handlePlans handles GET /api/v1/plans?session_id=...
func (app *App) handlePlans(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID := strings.TrimSpace(r.URL.Query().Get("session_id"))
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "session_id is required")
		return
	}

	plans, err := app.backend.Plans.ListBySession(r.Context(), principal, sessionID)
	if err != nil {
		writeBackendError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"plans": planDocsToResponse(plans)})
}

// handlePlanByID handles GET/PATCH /api/v1/plans/:id
func (app *App) handlePlanByID(w http.ResponseWriter, r *http.Request) {
	planID := strings.TrimPrefix(r.URL.Path, "/plans/")
	planID = strings.TrimSpace(planID)
	if planID == "" {
		writeJSONError(w, http.StatusBadRequest, "plan ID is required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		app.handleGetPlan(w, r, planID)
	case http.MethodPatch:
		app.handlePatchPlan(w, r, planID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (app *App) handleGetPlan(w http.ResponseWriter, r *http.Request, planID string) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	plan, err := app.backend.Plans.Get(r.Context(), principal, planID)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, planDocToResponse(*plan))
}

type patchPlanRequest struct {
	Content *string `json:"content,omitempty"`
	Status  *string `json:"status,omitempty"`
}

func (app *App) handlePatchPlan(w http.ResponseWriter, r *http.Request, planID string) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var req patchPlanRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}

	plan, err := app.backend.Plans.Patch(r.Context(), principal, planID, backendplans.PatchParams{
		Content: req.Content,
		Status:  req.Status,
	})
	if err != nil {
		writeBackendError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, planDocToResponse(*plan))
}

type planDocResponse struct {
	ID        string `json:"id"`
	SessionID string `json:"session_id"`
	Slug      string `json:"slug"`
	Filename  string `json:"filename"`
	Content   string `json:"content"`
	Status    string `json:"status"`
	Version   int    `json:"version"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

func planDocToResponse(p backendplans.Plan) planDocResponse {
	return planDocResponse{
		ID:        p.ID,
		SessionID: p.SessionID,
		Slug:      p.Slug,
		Filename:  p.Filename,
		Content:   p.Content,
		Status:    p.Status,
		Version:   p.Version,
		CreatedAt: p.CreatedAt.Unix(),
		UpdatedAt: p.UpdatedAt.Unix(),
	}
}

func planDocsToResponse(plans []backendplans.Plan) []planDocResponse {
	out := make([]planDocResponse, len(plans))
	for i, p := range plans {
		out[i] = planDocToResponse(p)
	}
	return out
}
