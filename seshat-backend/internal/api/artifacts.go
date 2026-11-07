package api

import (
	"io"
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/artifactlibs"
)

// artifactPreviewCSP is deliberately more permissive than the app's own
// packaged-renderer CSP (see seshat-desktop/src/main/content-security-policy.ts)
// in the dimensions previewing agent-written HTML needs - inline script/style,
// eval (Vue's and Alpine's template compilers, Babel's in-page JSX) and the
// libraries this backend serves under libBase (see handleArtifactLib) - while
// staying at least as strict everywhere else: no network egress at all
// (connect-src 'none', no other host anywhere), no further framing, no
// plugins, no form submission, no <base> retargeting. This header is scoped to
// this one response only (see handleArtifactPreviewGet); the rest of the app is
// never touched by it.
func artifactPreviewCSP(libBase string) string {
	lib := libBase + "/"
	return "default-src 'none'; " +
		"script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' " + lib + "; " +
		"style-src 'unsafe-inline' " + lib + "; " +
		"img-src data: blob: " + lib + "; " +
		"font-src data: " + lib + "; " +
		"worker-src blob:; " +
		"connect-src 'none'; " +
		"frame-src 'none'; " +
		"object-src 'none'; " +
		"base-uri 'none'; " +
		"form-action 'none'; " +
		// The frame of the app is already a sandbox (allow-scripts, no allow-same-origin). The same here, in the response, so that the page
		// opened by itself, outside the frame, runs with no origin either and not with the origin of the backend.
		"sandbox allow-scripts;"
}

// artifactLibBase is the library route as the previewed page reaches it: the
// page was loaded from this same host, so its own Host header names it.
func artifactLibBase(r *http.Request) string {
	return "http://" + r.Host + "/api/v1/artifacts/lib"
}

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
	if err == nil {
		// Only a page the app itself asked to preview may have its missing libraries downloaded.
		app.artifactLibs.AllowPage(body.HTML)
	}
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
	libBase := artifactLibBase(r)
	html = withPageReporter(artifactlibs.RewriteCDNURLs(html, libBase))
	w.Header().Set("Content-Security-Policy", artifactPreviewCSP(libBase))
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

// handleArtifactLib handles GET /api/v1/artifacts/lib/{host}/{path} - a CDN
// file a previewed page loads, rewritten to point here (see
// artifactlibs.RewriteCDNURLs). Unauthenticated like the preview itself: the
// page's <script src> and its module imports cannot carry a token. It only
// ever answers with public library files: the shipped ones, the cached ones,
// and a download for a package a page the app previewed named (see
// artifactlibs.Service.AllowPage). The page has an opaque origin, so module
// scripts and fonts arrive as CORS requests from "null" and need the
// wildcard; the sandbox CSP keeps a file opened by itself from running as a
// document on this origin.
func (app *App) handleArtifactLib(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	target := strings.TrimPrefix(r.URL.Path, "/artifacts/lib/")
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	served, err := app.artifactLibs.Serve(r.Context(), target, artifactLibBase(r))
	if err != nil {
		writeJSONError(w, http.StatusNotFound, err.Error())
		return
	}
	w.Header().Set("Content-Type", served.ContentType)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Seshat-Library-Source", served.Source)
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodGet {
		_, _ = w.Write(served.Body)
	}
}
