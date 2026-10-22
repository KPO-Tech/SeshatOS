package api

import (
	"errors"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var errArtifactOutsideFolder = errors.New("the file is outside the folders of this session")

// resolveSessionArtifact returns the file a session's agent presented: requested is its path, relative to one of the session's folders
// (its project folder or its workspace) or absolute inside one. Anything that, once links are followed, lies outside those folders is
// refused, so the endpoint can never serve a file the agent could not have written there.
func resolveSessionArtifact(roots []string, requested string) (string, error) {
	requested = strings.TrimSpace(requested)
	if requested == "" {
		return "", errors.New("path is required")
	}
	for _, root := range roots {
		root = strings.TrimSpace(root)
		if root == "" {
			continue
		}
		realRoot, err := filepath.EvalSymlinks(root)
		if err != nil {
			continue
		}
		candidate := requested
		if !filepath.IsAbs(candidate) {
			candidate = filepath.Join(root, filepath.FromSlash(candidate))
		}
		realFile, err := filepath.EvalSymlinks(candidate)
		if err != nil {
			continue
		}
		rel, err := filepath.Rel(realRoot, realFile)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
			continue
		}
		info, err := os.Stat(realFile)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		return realFile, nil
	}
	return "", errArtifactOutsideFolder
}

// handleSessionArtifact serves a file the agent showed in the conversation (GET /sessions/{id}/artifact?path=...), with range requests so
// that a clip can be played and searched without loading it whole.
func (app *App) handleSessionArtifact(w http.ResponseWriter, r *http.Request, principal any, sessionID string) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if app.backend.Query == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "session service not configured")
		return
	}
	p, _ := authPrincipalFromContext(r.Context())
	detail, err := app.backend.Query.GetSession(r.Context(), p, sessionID)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	file, err := resolveSessionArtifact([]string{detail.ProjectPath, detail.WorkspacePath}, r.URL.Query().Get("path"))
	if err != nil {
		writeJSONError(w, http.StatusNotFound, err.Error())
		return
	}
	handle, err := os.Open(file)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "file not found")
		return
	}
	defer handle.Close()
	info, err := handle.Stat()
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "file not found")
		return
	}
	if contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(file))); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Header().Set("Cache-Control", "private, max-age=60")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, filepath.Base(file), info.ModTime(), handle)
}
