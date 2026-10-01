package api

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	backendaudit "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/audit"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	backendfiles "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/files"
	backendquotas "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/quotas"
)

const maxUploadSize = 100 << 20 // 100 MB

// handleFiles dispatches POST /api/v1/files (upload) and GET /api/v1/files (list).
func (app *App) handleFiles(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	switch r.Method {
	case http.MethodPost:
		app.handleFileUpload(w, r, principal)
	case http.MethodGet:
		files, err := app.backend.Files.ListFiles(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"files": toFileResponses(files), "count": len(files)})
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleFileByID dispatches on /api/v1/files/{id}, /api/v1/files/{id}/content,
// and /api/v1/files/{id}/markdown.
func (app *App) handleFileByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/files/")
	path = strings.Trim(path, "/")
	if path == "" {
		writeJSONError(w, http.StatusBadRequest, "file id is required")
		return
	}

	// Split on "/" to detect /files/{id}/content
	parts := strings.SplitN(path, "/", 2)
	fileID := parts[0]
	subpath := ""
	if len(parts) == 2 {
		subpath = parts[1]
	}

	principal, _ := authPrincipalFromContext(r.Context())

	switch {
	case subpath == "content" && r.Method == http.MethodGet:
		app.handleFileDownload(w, r, principal, fileID)
	case subpath == "markdown" && r.Method == http.MethodGet:
		app.handleFileMarkdown(w, r, principal, fileID)
	case subpath == "":
		switch r.Method {
		case http.MethodGet:
			f, err := app.backend.Files.GetFile(r.Context(), principal, fileID)
			if err != nil {
				writeBackendError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, toFileResponse(*f))
		case http.MethodDelete:
			if err := app.backend.Files.DeleteFile(r.Context(), principal, fileID); err != nil {
				writeBackendError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	default:
		writeJSONError(w, http.StatusNotFound, fmt.Sprintf("unknown sub-resource: %s", subpath))
	}
}

func (app *App) handleFileUpload(w http.ResponseWriter, r *http.Request, principal any) {
	// principal here comes from authPrincipalFromContext — reuse the typed version
	p, _ := authPrincipalFromContext(r.Context())

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeJSONError(w, http.StatusBadRequest, "failed to parse multipart form: "+err.Error())
		return
	}

	mpFile, header, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "missing 'file' field in form")
		return
	}
	defer mpFile.Close()

	data, err := io.ReadAll(mpFile)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to read uploaded file")
		return
	}

	params := backendfiles.UploadFileParams{
		Filename:    header.Filename,
		ContentType: header.Header.Get("Content-Type"),
		Data:        data,
		WorkspaceID: r.FormValue("workspace_id"),
	}

	f, err := app.backend.Files.Upload(r.Context(), p, params)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	if p != nil {
		app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  p.User.ID,
			Action:       backendaudit.ActionFileUpload,
			ResourceType: "file",
			ResourceID:   f.ID,
			IPAddress:    app.clientIP(r),
			Metadata:     map[string]any{"filename": f.Filename, "size": f.Size},
		})
		app.backend.Quota.Increment(r.Context(), p, backendquotas.MetricFiles, 1)
	}
	writeJSON(w, http.StatusCreated, toFileResponse(*f))
}

func (app *App) handleFileDownload(w http.ResponseWriter, r *http.Request, _ any, fileID string) {
	principal, _ := authPrincipalFromContext(r.Context())

	reader, f, err := app.backend.Files.OpenFileReader(r.Context(), principal, fileID)
	if err != nil {
		// A corpus file attached in "connected mode" has no record in the
		// local Files store at all - its id is seshat-server's own
		// CorpusFile id, a different id space (see
		// cloudknowledge.RemoteService's doc comment). Knowledge.DownloadFile
		// resolves that case; any other error (auth, a genuinely missing
		// local file) still fails as before.
		if isNotFound(err) && app.backend.Knowledge != nil {
			downloaded, kErr := app.backend.Knowledge.DownloadFile(r.Context(), principal, fileID)
			if kErr == nil {
				writeFileContent(w, r, downloaded.ContentType, downloaded.Filename, downloaded.Data)
				return
			}
			// The Knowledge fallback was actually attempted (this id isn't a
			// local file, so the plain "file not found" above would be
			// misleading either way) - surface what it said instead of the
			// original local-store miss, so a real cause (auth, corpus
			// permission, seshat-server unreachable) isn't masked by it.
			writeBackendError(w, kErr)
			return
		}
		writeBackendError(w, err)
		return
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		writeBackendError(w, bkerr.Internal("read file content: "+err.Error(), err))
		return
	}
	writeFileContent(w, r, f.ContentType, f.Filename, data)
}

// isNotFound reports whether err is a bkerr.Error carrying
// ErrorKindNotFound - used to decide whether a local Files-store miss is
// worth retrying against Knowledge, rather than swallowing every failure
// (auth, backend unavailable) into a silent fallback.
func isNotFound(err error) bool {
	var bkErr *bkerr.Error
	return errors.As(err, &bkErr) && bkErr.Kind == bkerr.ErrorKindNotFound
}

// writeFileContent serves already-fully-read file bytes as a Range-aware
// response via http.ServeContent - the desktop PDF viewer (PDFViewerPanel.tsx)
// depends on this: it fetches small byte ranges through a custom
// PDFDataRangeTransport instead of pulling the whole file across IPC as one
// base64 blob, so pdf.js can start rendering before the full document has
// been read. The file is still read into memory once per request either way
// (local disk or a connected-mode download) - only the response to the
// caller becomes partial/206-capable, not the upstream read itself.
func writeFileContent(w http.ResponseWriter, r *http.Request, contentType, filename string, data []byte) {
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename=%q`, filename))
	http.ServeContent(w, r, filename, time.Time{}, bytes.NewReader(data))
}

// handleFileMarkdown serves the document-reader converted markdown text for a file
// that has one - the same conversion the upload pipeline already paid for,
// reused here (and by the agent's Read tool sidecar cache) instead of
// reconverting. 404s if the file has no markdown conversion recorded.
func (app *App) handleFileMarkdown(w http.ResponseWriter, r *http.Request, _ any, fileID string) {
	principal, _ := authPrincipalFromContext(r.Context())

	f, err := app.backend.Files.GetFile(r.Context(), principal, fileID)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	workspacePath := ""
	if app.backend.Query != nil && f.SessionID != "" {
		if resolved, wsErr := app.backend.Query.EnsureSessionWorkspace(r.Context(), principal, f.SessionID); wsErr == nil {
			workspacePath = resolved
		}
	}

	markdown, _, err := app.backend.Files.ReadMarkdown(r.Context(), principal, fileID, workspacePath)
	if err != nil {
		writeBackendError(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(markdown))
}

// handleSessionFiles handles:
//   - GET  /api/v1/sessions/:id/files   → list session uploads
//   - POST /api/v1/sessions/:id/files   → upload a file to the session workspace
func (app *App) handleSessionFiles(w http.ResponseWriter, r *http.Request, principal any, sessionID string) {
	if app.backend.Files == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "file service not configured")
		return
	}
	p, _ := authPrincipalFromContext(r.Context())

	switch r.Method {
	case http.MethodGet:
		if app.backend.Query == nil {
			writeJSONError(w, http.StatusServiceUnavailable, "session service not configured")
			return
		}
		if _, err := app.backend.Query.GetSession(r.Context(), p, sessionID); err != nil {
			writeBackendError(w, err)
			return
		}
		files, err := app.backend.Files.ListSessionFiles(r.Context(), p, sessionID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"files": toFileResponses(files), "count": len(files)})

	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			writeJSONError(w, http.StatusBadRequest, "failed to parse multipart form: "+err.Error())
			return
		}
		mpFile, header, err := r.FormFile("file")
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "missing 'file' field in form")
			return
		}
		defer mpFile.Close()
		data, err := io.ReadAll(mpFile)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to read uploaded file")
			return
		}

		// Resolve session workspace path.
		workspacePath := ""
		if app.backend.Query != nil {
			if ensured, ensureErr := app.backend.Query.EnsureSessionWorkspace(r.Context(), p, sessionID); ensureErr == nil {
				workspacePath = ensured
			} else {
				writeBackendError(w, ensureErr)
				return
			}
			if workspacePath == "" {
				if detail, detailErr := app.backend.Query.GetSession(r.Context(), p, sessionID); detailErr == nil {
					workspacePath = detail.WorkspacePath
				}
			}
		}

		f, err := app.backend.Files.UploadSessionFile(r.Context(), p, sessionID, workspacePath, backendfiles.UploadFileParams{
			Filename:    header.Filename,
			ContentType: header.Header.Get("Content-Type"),
			Data:        data,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		if p != nil {
			app.backend.Audit.Log(r.Context(), backendaudit.LogParams{
				ActorUserID:  p.User.ID,
				Action:       backendaudit.ActionFileUpload,
				ResourceType: "file",
				ResourceID:   f.ID,
				IPAddress:    app.clientIP(r),
				Metadata:     map[string]any{"filename": f.Filename, "size": f.Size, "session_id": sessionID},
			})
			app.backend.Quota.Increment(r.Context(), p, backendquotas.MetricFiles, 1)
		}
		writeJSON(w, http.StatusCreated, toFileResponse(*f))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// --- response helpers ---

type fileResponse struct {
	ID                      string `json:"id"`
	UserID                  string `json:"user_id"`
	WorkspaceID             string `json:"workspace_id,omitempty"`
	SessionID               string `json:"session_id,omitempty"`
	Category                string `json:"category,omitempty"`
	LocalPath               string `json:"local_path,omitempty"`
	MarkdownPath            string `json:"markdown_path,omitempty"`
	DocumentReadStatus      string `json:"document_read_status,omitempty"`
	DocumentReadEngine      string `json:"document_read_engine,omitempty"`
	DocumentReadPages       int    `json:"document_read_pages,omitempty"`
	DocumentReadImages      int    `json:"document_read_images,omitempty"`
	DocumentReadVisualPages []int  `json:"document_read_visual_pages,omitempty"`
	Filename                string `json:"filename"`
	ContentType             string `json:"content_type"`
	Size                    int64  `json:"size"`
	SHA256                  string `json:"sha256,omitempty"`
	CreatedAt               int64  `json:"created_at"`
	UpdatedAt               int64  `json:"updated_at"`
}

func toFileResponse(f backendfiles.File) fileResponse {
	return fileResponse{
		ID:                      f.ID,
		UserID:                  f.UserID,
		WorkspaceID:             f.WorkspaceID,
		SessionID:               f.SessionID,
		Category:                f.Category,
		LocalPath:               f.LocalPath,
		MarkdownPath:            f.MarkdownPath,
		DocumentReadStatus:      f.DocumentReadStatus,
		DocumentReadEngine:      f.DocumentReadEngine,
		DocumentReadPages:       f.DocumentReadPages,
		DocumentReadImages:      f.DocumentReadImages,
		DocumentReadVisualPages: f.DocumentReadVisualPages,
		Filename:                f.Filename,
		ContentType:             f.ContentType,
		Size:                    f.Size,
		SHA256:                  f.SHA256,
		CreatedAt:               f.CreatedAt.Unix(),
		UpdatedAt:               f.UpdatedAt.Unix(),
	}
}

func toFileResponses(fs []backendfiles.File) []fileResponse {
	out := make([]fileResponse, 0, len(fs))
	for _, f := range fs {
		out = append(out, toFileResponse(f))
	}
	return out
}
