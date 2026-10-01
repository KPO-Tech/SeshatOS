package api

import (
	"io"
	"net/http"
	"strings"
)

// artifactPreviewCSP is deliberately more permissive than the app's own
// packaged-renderer CSP (see seshat-ui/src/main/content-security-policy.ts)
// in exactly one dimension - inline script/style execution, the entire
// point of previewing agent-written HTML - while staying at least as
// strict everywhere else: no network egress at all (connect-src/img-src/
// font-src can't reach the outside world beyond inline data: URIs), no
// further framing, no plugins, no form submission, no <base> retargeting.
// This header is scoped to this one response only (see handleArtifactPreviewGet);
// the rest of the app is never touched by it.
const artifactPreviewCSP = "default-src 'none'; " +
	"script-src 'unsafe-inline'; " +
	"style-src 'unsafe-inline'; " +
	"img-src data: blob:; " +
	"font-src data:; " +
	"connect-src 'none'; " +
	"frame-src 'none'; " +
	"object-src 'none'; " +
	"base-uri 'none'; " +
	"form-action 'none';"

// handleArtifactPreviewCreate handles POST /api/v1/artifacts/preview -
// stores a self-contained HTML document and returns a capability ID for
// handleArtifactPreviewGet to serve it back by. Authenticated: only the
// desktop app itself (via the IPC HTTP bridge) should be minting these.
func (app *App) handleArtifactPreviewCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	var body struct {
		HTML string `json:"html"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.HTML) == "" {
		writeJSONError(w, http.StatusBadRequest, "html is required")
		return
	}
	if app.artifactPreviews == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "artifact preview not configured")
		return
	}

	id, err := app.artifactPreviews.Put(body.HTML)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// handleArtifactPreviewGet handles GET /api/v1/artifacts/preview/{id} -
// deliberately unauthenticated. The <iframe> element that requests this
// can't attach an Authorization header (it's a plain browser navigation,
// not a fetch() this app controls), so the random, unguessable ID itself
// is the capability - same pattern as a share link. Entries expire after
// artifactpreview.TTL regardless of whether they're ever fetched.
func (app *App) handleArtifactPreviewGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/artifacts/preview/")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "artifact id is required")
		return
	}
	if app.artifactPreviews == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "artifact preview not configured")
		return
	}

	html, ok := app.artifactPreviews.Get(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "artifact preview not found or expired")
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", artifactPreviewCSP)
	// No X-Frame-Options here, deliberately: this response's entire purpose
	// is being framed by the app's renderer, which is a different origin
	// (file:// in the packaged app) from this backend's http://127.0.0.1 -
	// SAMEORIGIN would block exactly that. The CSP's frame-src on the
	// parent document (see content-security-policy.ts) plus this URL's
	// unguessable capability ID are the actual access controls here.
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, html)
}
