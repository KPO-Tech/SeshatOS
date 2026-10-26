package api

import (
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/folderplan"
)

// localKnowledge returns the knowledge service of this computer, or answers why there is none: sources are a local notion, a device
// connected to an organization takes its collections from the organization's server.
func (a *App) localKnowledge(w http.ResponseWriter) (*knowledge.Service, bool) {
	if a.connectedServerURL != "" {
		writeJSONError(w, http.StatusConflict, "sources are kept on this computer only, not on a device connected to an organization")
		return nil, false
	}
	svc, ok := a.backend.Knowledge.(*knowledge.Service)
	if !ok {
		writeJSONError(w, http.StatusNotImplemented, "sources are not supported in connected mode")
		return nil, false
	}
	return svc, true
}

// handleKnowledgeSources lists the sources of the person and adds one.
//
//	GET  /api/v1/knowledge/sources                                  {"default":{"collection_count":n},"sources":[{id,kind,name,root,collection_count}]}
//	POST /api/v1/knowledge/sources  {"kind":"local_folder","path":"<absolute folder>","name":"<optional>"}
//
// Adding a source reads nothing: the folder is only checked to be a folder. Its collections are made later, from an analysis.
func (a *App) handleKnowledgeSources(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	switch r.Method {
	case http.MethodGet:
		svc, ok := a.backend.Knowledge.(*knowledge.Service)
		if !ok {
			writeJSON(w, http.StatusOK, map[string]any{"default": map[string]int{"collection_count": 0}, "sources": []knowledge.Source{}})
			return
		}
		sources, defaultCount, err := svc.ListSources(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"default": map[string]int{"collection_count": defaultCount}, "sources": sources})
	case http.MethodPost:
		svc, ok := a.localKnowledge(w)
		if !ok {
			return
		}
		var body struct {
			Kind string `json:"kind"`
			Path string `json:"path"`
			Name string `json:"name"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if body.Kind != knowledge.SourceKindLocalFolder {
			writeJSONError(w, http.StatusBadRequest, "kind must be local_folder")
			return
		}
		root, err := folderplan.CheckRoot(body.Path)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, err.Error())
			return
		}
		src, err := svc.CreateFolderSource(r.Context(), principal, body.Name, root)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, src)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleKnowledgeSource serves DELETE /api/v1/knowledge/sources/{id}: a source that holds no collection is removed.
func (a *App) handleKnowledgeSource(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/knowledge/sources/"), "/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	svc, ok := a.localKnowledge(w)
	if !ok {
		return
	}
	if err := svc.DeleteSource(r.Context(), principal, id); err != nil {
		writeBackendError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
