package api

import (
	"net/http"
)

// handleKnowledgeReembed starts, follows and stops the making of the vectors of the collections again with the embedding model now in
// use (see knowledge/reembed.go).
//
//	GET    /api/v1/knowledge/reembed   {"state","model","done","total","error"}
//	POST   /api/v1/knowledge/reembed   starts it (or returns the one running)
//	DELETE /api/v1/knowledge/reembed   stops it; what was done stays done
func (a *App) handleKnowledgeReembed(w http.ResponseWriter, r *http.Request) {
	svc, ok := a.localKnowledge(w)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, svc.ReembedStatus())
	case http.MethodPost:
		principal, _ := authPrincipalFromContext(r.Context())
		status, err := svc.StartReembed(principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusAccepted, status)
	case http.MethodDelete:
		svc.CancelReembed()
		writeJSON(w, http.StatusOK, svc.ReembedStatus())
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
