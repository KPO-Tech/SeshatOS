package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/memories"
)

type memoryResponse struct {
	ID         string  `json:"id"`
	Type       string  `json:"type"`
	Key        string  `json:"key"`
	Value      string  `json:"value"`
	Importance float64 `json:"importance"`
	Source     string  `json:"source,omitempty"`
	CreatedAt  int64   `json:"created_at"`
	UpdatedAt  int64   `json:"updated_at"`
}

func memoryToResponse(m memories.UserMemory) memoryResponse {
	return memoryResponse{
		ID:         m.ID,
		Type:       m.Type,
		Key:        m.Key,
		Value:      m.Value,
		Importance: m.Importance,
		Source:     m.Source,
		CreatedAt:  m.CreatedAt.Unix(),
		UpdatedAt:  m.UpdatedAt.Unix(),
	}
}

// GET  /api/v1/memories       → list
// POST /api/v1/memories       → create
// DELETE /api/v1/memories     → clear all
func (a *App) handleMemories(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	switch r.Method {
	case http.MethodGet:
		list, err := a.backend.Memories.List(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		items := make([]memoryResponse, 0, len(list))
		for _, m := range list {
			items = append(items, memoryToResponse(m))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"memories": items,
			"count":    len(items),
		})

	case http.MethodPost:
		var body struct {
			Type       string  `json:"type"`
			Key        string  `json:"key"`
			Value      string  `json:"value"`
			Importance float64 `json:"importance"`
			Source     string  `json:"source"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		m, err := a.backend.Memories.Create(r.Context(), principal, memories.CreateParams{
			Type:       body.Type,
			Key:        body.Key,
			Value:      body.Value,
			Importance: body.Importance,
			Source:     body.Source,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, memoryToResponse(*m))

	case http.MethodDelete:
		deleted, err := a.backend.Memories.DeleteAll(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// PUT /api/v1/memories/{id}
// DELETE /api/v1/memories/{id}
func (a *App) handleMemoryByID(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/memories/")
	id = strings.Trim(id, "/")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "memory id required")
		return
	}

	switch r.Method {
	case http.MethodPut:
		var body struct {
			Type       *string  `json:"type"`
			Key        *string  `json:"key"`
			Value      *string  `json:"value"`
			Importance *float64 `json:"importance"`
			Source     *string  `json:"source"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		memory, err := a.backend.Memories.Update(r.Context(), principal, id, memories.UpdateParams{
			Type:       body.Type,
			Key:        body.Key,
			Value:      body.Value,
			Importance: body.Importance,
			Source:     body.Source,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, memoryToResponse(*memory))

	case http.MethodDelete:
		if err := a.backend.Memories.Delete(r.Context(), principal, id); err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
