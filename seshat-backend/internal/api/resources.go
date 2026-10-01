package api

import (
	"net/http"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
)

type createUserRequest struct {
	Email       string   `json:"email"`
	DisplayName string   `json:"display_name"`
	Password    string   `json:"password"`
	Status      string   `json:"status"`
	Roles       []string `json:"roles"`
}

type createOrganizationRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type createWorkspaceRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
}

type updateOrganizationRequest struct {
	Name   *string `json:"name,omitempty"`
	Slug   *string `json:"slug,omitempty"`
	Status *string `json:"status,omitempty"`
}

type updateWorkspaceRequest struct {
	OrganizationID *string `json:"organization_id,omitempty"`
	Name           *string `json:"name,omitempty"`
	Slug           *string `json:"slug,omitempty"`
	Status         *string `json:"status,omitempty"`
}

func (app *App) handleUsersLegacy(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		users, err := app.backend.Auth.ListUsers(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"users": toUserResponses(users), "count": len(users)})
	case http.MethodPost:
		var req createUserRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		user, err := app.backend.Auth.CreateUser(r.Context(), principal, backendauth.CreateUserParams{
			Email:       req.Email,
			DisplayName: req.DisplayName,
			Password:    req.Password,
			Status:      req.Status,
			Roles:       req.Roles,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, toAuthUserResponse(*user))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleUserDelete handles the DELETE case of /api/v1/users/{id}. GET and PUT
// are handled directly by handleUserByID in users.go — this used to be a
// shared GET/PUT/DELETE handler ("legacy"), but the PUT branch double-decoded
// an already-consumed request body (handleUserByID decoded it first), which
// made every admin user update fail with a 400. Trimmed to the one method
// that's actually still reachable through routing.
func (app *App) handleUserDelete(w http.ResponseWriter, r *http.Request) {
	userID := strings.TrimPrefix(r.URL.Path, "/users/")
	if userID == "" {
		writeJSONError(w, http.StatusBadRequest, "user id is required")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := app.backend.Auth.DeleteUser(r.Context(), principal, userID); err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "deleted"})
}

func (app *App) handleOrganizations(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		orgs, err := app.backend.Auth.ListOrganizations(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"organizations": toOrganizationResponses(orgs), "count": len(orgs)})
	case http.MethodPost:
		var req createOrganizationRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		org, err := app.backend.Auth.CreateOrganization(r.Context(), principal, backendauth.CreateOrganizationParams{
			Name: req.Name,
			Slug: req.Slug,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, toOrganizationResponse(*org))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (app *App) handleOrganizationByID(w http.ResponseWriter, r *http.Request) {
	orgID := strings.TrimPrefix(r.URL.Path, "/organizations/")
	if orgID == "" {
		writeJSONError(w, http.StatusBadRequest, "organization id is required")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		org, err := app.backend.Auth.GetOrganization(r.Context(), principal, orgID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toOrganizationResponse(*org))
	case http.MethodPut:
		var req updateOrganizationRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		org, err := app.backend.Auth.UpdateOrganization(r.Context(), principal, orgID, backendauth.UpdateOrganizationParams{
			Name:   req.Name,
			Slug:   req.Slug,
			Status: req.Status,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toOrganizationResponse(*org))
	case http.MethodDelete:
		if err := app.backend.Auth.DeleteOrganization(r.Context(), principal, orgID); err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "deleted"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (app *App) handleWorkspaces(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		workspaces, err := app.backend.Auth.ListWorkspaces(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"workspaces": toWorkspaceResponses(workspaces), "count": len(workspaces)})
	case http.MethodPost:
		var req createWorkspaceRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		workspace, err := app.backend.Auth.CreateWorkspace(r.Context(), principal, backendauth.CreateWorkspaceParams{
			OrganizationID: req.OrganizationID,
			Name:           req.Name,
			Slug:           req.Slug,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, toWorkspaceResponse(*workspace))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (app *App) handleWorkspaceByID(w http.ResponseWriter, r *http.Request) {
	workspaceID := strings.TrimPrefix(r.URL.Path, "/workspaces/")
	if workspaceID == "" {
		writeJSONError(w, http.StatusBadRequest, "workspace id is required")
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		workspace, err := app.backend.Auth.GetWorkspace(r.Context(), principal, workspaceID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toWorkspaceResponse(*workspace))
	case http.MethodPut:
		var req updateWorkspaceRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		workspace, err := app.backend.Auth.UpdateWorkspace(r.Context(), principal, workspaceID, backendauth.UpdateWorkspaceParams{
			OrganizationID: req.OrganizationID,
			Name:           req.Name,
			Slug:           req.Slug,
			Status:         req.Status,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, toWorkspaceResponse(*workspace))
	case http.MethodDelete:
		if err := app.backend.Auth.DeleteWorkspace(r.Context(), principal, workspaceID); err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "deleted"})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func toUserResponses(users []backendauth.User) []authUserResponse {
	out := make([]authUserResponse, 0, len(users))
	for _, user := range users {
		out = append(out, toAuthUserResponse(user))
	}
	return out
}

func toOrganizationResponses(orgs []backendauth.Organization) []map[string]any {
	out := make([]map[string]any, 0, len(orgs))
	for _, org := range orgs {
		out = append(out, toOrganizationResponse(org))
	}
	return out
}

func toOrganizationResponse(org backendauth.Organization) map[string]any {
	return map[string]any{
		"id":            org.ID,
		"name":          org.Name,
		"slug":          org.Slug,
		"owner_user_id": org.OwnerUserID,
		"status":        org.Status,
	}
}

func toWorkspaceResponses(workspaces []backendauth.Workspace) []map[string]any {
	out := make([]map[string]any, 0, len(workspaces))
	for _, workspace := range workspaces {
		out = append(out, toWorkspaceResponse(workspace))
	}
	return out
}

func toWorkspaceResponse(workspace backendauth.Workspace) map[string]any {
	return map[string]any{
		"id":              workspace.ID,
		"organization_id": workspace.OrganizationID,
		"name":            workspace.Name,
		"slug":            workspace.Slug,
		"status":          workspace.Status,
	}
}
