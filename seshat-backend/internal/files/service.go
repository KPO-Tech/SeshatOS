package files

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/documentreading"
	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/storage"
	"github.com/KPO-Tech/seshat/pkg/workspace"
)

type Service struct {
	files                    *db.FileStore
	store                    storage.ArtifactStore
	resolveDocumentConverter func(ctx context.Context) documentreader.Converter
	documentProcessor        *documentreading.Processor
}

const sessionDocumentReadTimeout = 30 * time.Minute

func NewService(files *db.FileStore, store storage.ArtifactStore) *Service {
	return &Service{files: files, store: store}
}

// WithDocumentReader attaches a resolver that returns the document converter
// to use for a given call, re-evaluated every time rather than cached.
func (s *Service) WithDocumentReader(resolve func(ctx context.Context) documentreader.Converter) *Service {
	s.resolveDocumentConverter = resolve
	s.documentProcessor = documentreading.NewProcessor(resolve)
	return s
}

// Upload stores the blob in ArtifactStore and records product metadata in DB.
func (s *Service) Upload(ctx context.Context, principal *backendauth.Principal, params UploadFileParams) (*File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(params.Filename) == "" {
		return nil, bkerr.InvalidInput("filename is required", nil)
	}
	if len(params.Data) == 0 {
		return nil, bkerr.InvalidInput("file content is empty", nil)
	}

	contentType := strings.TrimSpace(params.ContentType)
	if contentType == "" {
		contentType = storage.DetectContentType(params.Filename)
	}

	sum := sha256.Sum256(params.Data)
	hash := hex.EncodeToString(sum[:])

	storageKey := fmt.Sprintf("files/%s", newBlobID())

	if s.store != nil {
		if _, err := s.store.Put(ctx, storageKey, params.Data, contentType); err != nil {
			return nil, bkerr.Internal("store file blob: "+err.Error(), err)
		}
	}

	record, err := s.files.Create(ctx, db.CreateFileParams{
		UserID:      principal.User.ID,
		WorkspaceID: params.WorkspaceID,
		Filename:    params.Filename,
		ContentType: contentType,
		Size:        int64(len(params.Data)),
		StorageKey:  storageKey,
		SHA256:      hash,
	})
	if err != nil {
		if s.store != nil {
			_ = s.store.Delete(ctx, storageKey)
		}
		return nil, bkerr.Internal("record file metadata: "+err.Error(), err)
	}

	return s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
}

// ListFiles returns files visible to the principal.
func (s *Service) ListFiles(ctx context.Context, principal *backendauth.Principal) ([]File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}

	var records []db.File
	var err error
	if principal.HasRole("admin") {
		records, err = s.files.ListAll(ctx)
	} else {
		records, err = s.files.ListByUserID(ctx, principal.User.ID)
	}
	if err != nil {
		return nil, bkerr.Internal("list files: "+err.Error(), err)
	}

	result := make([]File, 0, len(records))
	for _, r := range records {
		result = append(result, *s.enrichDocumentReadMetadata(ctx, fileFromDB(r)))
	}
	return result, nil
}

// GetFile returns file metadata, enforcing ownership.
func (s *Service) GetFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	return s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
}

// DownloadFile returns raw bytes of a file, enforcing ownership.
func (s *Service) DownloadFile(ctx context.Context, principal *backendauth.Principal, fileID string) ([]byte, *File, error) {
	if s == nil || s.files == nil {
		return nil, nil, bkerr.Unavailable("file store not configured", nil)
	}
	if s.store == nil {
		return nil, nil, bkerr.Unavailable("blob storage not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, nil, err
	}
	data, err := s.store.Get(ctx, record.StorageKey)
	if err != nil {
		return nil, nil, bkerr.Internal("read file blob: "+err.Error(), err)
	}
	return data, s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
}

// OpenFileReader returns a streaming reader for a file, enforcing ownership.
func (s *Service) OpenFileReader(ctx context.Context, principal *backendauth.Principal, fileID string) (io.ReadCloser, *File, error) {
	if s == nil || s.files == nil {
		return nil, nil, bkerr.Unavailable("file store not configured", nil)
	}
	if s.store == nil {
		return nil, nil, bkerr.Unavailable("blob storage not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, nil, err
	}
	reader, _, err := s.store.OpenReader(ctx, record.StorageKey)
	if err != nil {
		return nil, nil, bkerr.Internal("open file reader: "+err.Error(), err)
	}
	return reader, s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
}

// ReadMarkdown returns the converted markdown text for a file that
// has one (MarkdownPath set at upload time), enforcing ownership. workspacePath
// is the caller-resolved workspace root for the file's session - the same
// value UploadSessionFile was given when it wrote the sidecar in the first
// place, since MarkdownPath is stored workspace-relative.
func (s *Service) ReadMarkdown(ctx context.Context, principal *backendauth.Principal, fileID, workspacePath string) (string, *File, error) {
	if s == nil || s.files == nil {
		return "", nil, bkerr.Unavailable("file store not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return "", nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return "", nil, err
	}
	if record.MarkdownPath == "" {
		if markdown, ok := s.cachedReadResultMarkdown(ctx, record.ID); ok {
			return markdown, s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
		}
		return "", nil, bkerr.NotFound("no markdown conversion available for this file", nil)
	}
	if workspacePath == "" {
		if markdown, ok := s.cachedReadResultMarkdown(ctx, record.ID); ok {
			return markdown, s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
		}
		return "", nil, bkerr.NotFound("workspace unavailable", nil)
	}

	// MarkdownPath is always server-generated (never user input), but resolve
	// defensively anyway: reject anything that would land outside workspacePath.
	absWorkspace, err := filepath.Abs(workspacePath)
	if err != nil {
		return "", nil, bkerr.Internal("resolve workspace path: "+err.Error(), err)
	}
	mdPath, err := filepath.Abs(filepath.Join(absWorkspace, record.MarkdownPath))
	if err != nil || (mdPath != absWorkspace && !strings.HasPrefix(mdPath, absWorkspace+string(filepath.Separator))) {
		return "", nil, bkerr.Internal("markdown path escapes workspace", err)
	}

	data, err := os.ReadFile(mdPath)
	if err != nil {
		if markdown, ok := s.cachedReadResultMarkdown(ctx, record.ID); ok {
			return markdown, s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
		}
		return "", nil, bkerr.NotFound("markdown file not found on disk", err)
	}
	return string(data), s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
}

func (s *Service) cachedReadResultMarkdown(ctx context.Context, fileID string) (string, bool) {
	result, ok, err := documentreading.LoadReadResult(ctx, s.store, fileID)
	if err != nil || !ok || strings.TrimSpace(result.Markdown) == "" {
		return "", false
	}
	return result.Markdown, true
}

func (s *Service) enrichDocumentReadMetadata(ctx context.Context, f *File) *File {
	if f == nil {
		return nil
	}
	convertible := documentreading.AllConvertibleExtensions[strings.ToLower(filepath.Ext(f.Filename))]
	if f.MarkdownPath != "" {
		f.DocumentReadStatus = "converted"
	}
	if result, ok, err := documentreading.LoadReadResult(ctx, s.store, f.ID); err == nil && ok {
		f.DocumentReadStatus = "converted"
		f.DocumentReadEngine = result.Engine
		f.DocumentReadPages = result.PageCount
		f.DocumentReadImages = len(result.Images)
		f.DocumentReadVisualPages = visualPagesFromReadResult(result)
		return f
	}
	if !convertible || f.DocumentReadStatus != "" {
		return f
	}
	if _, ok, err := documentreading.LoadReadFailure(ctx, s.store, f.ID); err == nil && ok {
		f.DocumentReadStatus = "failed"
		return f
	}
	if time.Since(f.UpdatedAt) <= sessionDocumentReadTimeout+time.Minute {
		f.DocumentReadStatus = "processing"
	} else {
		f.DocumentReadStatus = "failed"
	}
	return f
}

func visualPagesFromReadResult(result documentreading.ReadResult) []int {
	pages := make([]int, 0)
	seen := make(map[int]bool)
	for _, page := range result.Pages {
		if page.Page <= 0 || !page.HasImage || seen[page.Page] {
			continue
		}
		seen[page.Page] = true
		pages = append(pages, page.Page)
	}
	return pages
}

// resolveWorkspacePath joins a workspace-relative path (always
// server-generated, never user input) onto absWorkspace and rejects the
// result if it would land outside absWorkspace.
func resolveWorkspacePath(absWorkspace, rel string) (string, error) {
	joined, err := filepath.Abs(filepath.Join(absWorkspace, rel))
	if err != nil {
		return "", err
	}
	if joined != absWorkspace && !strings.HasPrefix(joined, absWorkspace+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes workspace")
	}
	return joined, nil
}

// DeleteFile removes the blob and DB record, enforcing ownership.
func (s *Service) DeleteFile(ctx context.Context, principal *backendauth.Principal, fileID string) error {
	if s == nil || s.files == nil {
		return bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return err
	}
	if s.store != nil {
		_ = s.store.Delete(ctx, record.StorageKey)
	}
	if err := s.files.Delete(ctx, fileID); err != nil {
		return bkerr.Internal("delete file record: "+err.Error(), err)
	}
	return nil
}

// DeleteBySessionID removes every file record and blob attached to
// sessionID, regardless of whether any of them were ever attached to a sent
// message. Called when the session itself is deleted (see
// query.Service.DeleteSession) - the workspace directory those files were
// also written to is a separate, unrelated cleanup the caller handles
// itself (os.RemoveAll on the workspace path), since this package only
// owns the DB records and blob store, not the filesystem layout.
// Best-effort per file: a failure on one record doesn't stop the rest from
// being cleaned up, since the session is already gone either way.
func (s *Service) DeleteBySessionID(ctx context.Context, sessionID string) error {
	if s == nil || s.files == nil {
		return nil
	}
	records, err := s.files.ListBySessionID(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("list session files: %w", err)
	}
	var firstErr error
	for _, record := range records {
		if s.store != nil {
			_ = s.store.Delete(ctx, record.StorageKey)
		}
		if err := s.files.Delete(ctx, record.ID); err != nil && firstErr == nil {
			firstErr = fmt.Errorf("delete file %s: %w", record.ID, err)
		}
	}
	return firstErr
}

// checkAccess grants an admin bypass — files are treated as operationally
// administrable, unlike session/conversation content (see the no-bypass note
// on query.Service.checkSessionAccess for why that one differs deliberately).
func (s *Service) checkAccess(principal *backendauth.Principal, record *db.File) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	if principal.HasRole("admin") {
		return nil
	}
	if record.UserID != principal.User.ID {
		return bkerr.Forbidden("file belongs to another user", nil)
	}
	return nil
}

func fileFromDB(r db.File) *File {
	return &File{
		ID:               r.ID,
		UserID:           r.UserID,
		WorkspaceID:      r.WorkspaceID,
		SessionID:        r.SessionID,
		Category:         r.Category,
		LocalPath:        r.LocalPath,
		MarkdownPath:     r.MarkdownPath,
		Filename:         r.Filename,
		ContentType:      r.ContentType,
		Size:             r.Size,
		SHA256:           r.SHA256,
		UserMessageIndex: r.UserMessageIndex,
		CreatedAt:        r.CreatedAt,
		UpdatedAt:        r.UpdatedAt,
	}
}

// ClassifyCategory returns "images", "documents", "audio", or "other".
func ClassifyCategory(filename, contentType string) string {
	ct := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))

	// Audio check first.
	if strings.HasPrefix(ct, "audio/") {
		return CategoryAudio
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".webm":
		return CategoryAudio
	}

	if strings.HasPrefix(ct, "image/") {
		return CategoryImages
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico":
		return CategoryImages
	case ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
		".txt", ".md", ".markdown", ".csv", ".tsv", ".rtf", ".odt",
		".tex", ".html", ".htm", ".latex":
		return CategoryDocuments
	}
	switch ct {
	case "application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return CategoryDocuments
	}
	if strings.HasPrefix(ct, "text/") {
		return CategoryDocuments
	}
	return CategoryOther
}

// UploadSessionFile stores a file in the session workspace + blob store and records it in DB.
// The file is written to workspacePath/uploads/{category}/{filename} (collision-safe).
// Document conversion is intentionally kicked off in the background: native OCR
// can take a long time on scanned PDFs, and attaching a file in chat must not
// block until full OCR has finished.
func (s *Service) UploadSessionFile(ctx context.Context, principal *backendauth.Principal, sessionID, workspacePath string, params UploadFileParams) (*File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(params.Filename) == "" {
		return nil, bkerr.InvalidInput("filename is required", nil)
	}
	if len(params.Data) == 0 {
		return nil, bkerr.InvalidInput("file content is empty", nil)
	}

	contentType := strings.TrimSpace(params.ContentType)
	if contentType == "" {
		contentType = storage.DetectContentType(params.Filename)
	}

	category := ClassifyCategory(params.Filename, contentType)

	sum := sha256.Sum256(params.Data)
	hash := hex.EncodeToString(sum[:])

	// Write to workspace filesystem.
	localRelPath := ""
	destPath := ""

	if workspacePath != "" {
		ws, err := workspace.New(workspacePath)
		if err == nil {
			_ = ws.EnsureSubdirs()
			destDir := ws.UploadsPath(category)
			destPath = safeFilePath(destDir, params.Filename)
			if writeErr := os.WriteFile(destPath, params.Data, 0o600); writeErr == nil {
				if rel, relErr := filepath.Rel(workspacePath, destPath); relErr == nil {
					localRelPath = rel
				}
			}
		}
	}

	// Store in blob store (for download).
	storageKey := fmt.Sprintf("sessions/%s/uploads/%s", sessionID, newBlobID())
	if s.store != nil {
		if _, err := s.store.Put(ctx, storageKey, params.Data, contentType); err != nil {
			return nil, bkerr.Internal("store file blob: "+err.Error(), err)
		}
	}

	record, err := s.files.Create(ctx, db.CreateFileParams{
		UserID:      principal.User.ID,
		SessionID:   sessionID,
		Category:    category,
		LocalPath:   localRelPath,
		Filename:    params.Filename,
		ContentType: contentType,
		Size:        int64(len(params.Data)),
		StorageKey:  storageKey,
		SHA256:      hash,
	})
	if err != nil {
		if s.store != nil {
			_ = s.store.Delete(ctx, storageKey)
		}
		return nil, bkerr.Internal("record file metadata: "+err.Error(), err)
	}
	s.convertSessionFileAsync(record.ID, workspacePath, destPath, params.Filename, contentType, hash, append([]byte(nil), params.Data...))

	return s.enrichDocumentReadMetadata(ctx, fileFromDB(*record)), nil
}

func (s *Service) convertSessionFileAsync(fileID, workspacePath, destPath, filename, contentType, sha256Hash string, data []byte) {
	if s == nil || strings.TrimSpace(fileID) == "" || destPath == "" {
		return
	}
	if !documentreading.AllConvertibleExtensions[strings.ToLower(filepath.Ext(filename))] {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), sessionDocumentReadTimeout)
		defer cancel()
		processor := s.documentProcessor
		if processor == nil {
			processor = documentreading.NewProcessor(s.resolveDocumentConverter)
		}
		result, ok, err := processor.ReadFile(ctx, documentreading.ReadInput{
			SourceFileID: fileID,
			Filename:     filename,
			ContentType:  contentType,
			FilePath:     destPath,
			Data:         data,
			SHA256:       sha256Hash,
		})
		if err != nil {
			log.Printf("[files] document read failed for %s (%s): %v", filename, fileID, err)
			s.saveSessionFileReadFailure(ctx, fileID, err.Error())
			return
		}
		if !ok {
			s.saveSessionFileReadFailure(ctx, fileID, "document reader returned no result")
			return
		}
		mdPath := strings.TrimSuffix(destPath, filepath.Ext(destPath)) + ".md"
		if writeErr := os.WriteFile(mdPath, []byte(result.Markdown), 0o600); writeErr != nil {
			log.Printf("[files] write markdown sidecar failed for %s (%s): %v", filename, fileID, writeErr)
			s.saveSessionFileReadFailure(ctx, fileID, writeErr.Error())
			return
		}
		sidecar := documentreading.NewReadSidecar(result)
		if sidecarBody, sidecarErr := json.MarshalIndent(sidecar, "", "  "); sidecarErr == nil {
			sidecarPath := strings.TrimSuffix(destPath, filepath.Ext(destPath)) + ".document.json"
			if writeErr := os.WriteFile(sidecarPath, sidecarBody, 0o600); writeErr != nil {
				log.Printf("[files] write document sidecar failed for %s (%s): %v", filename, fileID, writeErr)
			}
		}
		if workspacePath != "" {
			if rel, relErr := filepath.Rel(workspacePath, mdPath); relErr == nil {
				if setErr := s.files.SetMarkdownPath(ctx, fileID, rel); setErr != nil {
					log.Printf("[files] set markdown path failed for %s (%s): %v", filename, fileID, setErr)
					s.saveSessionFileReadFailure(ctx, fileID, setErr.Error())
				}
			} else {
				s.saveSessionFileReadFailure(ctx, fileID, relErr.Error())
			}
		}
		for _, img := range result.Images {
			imgPath := filepath.Join(filepath.Dir(destPath), img.Filename)
			imgData, decErr := base64.StdEncoding.DecodeString(img.Base64)
			if decErr == nil {
				_ = os.WriteFile(imgPath, imgData, 0o600)
			}
		}
		if s.store != nil {
			_ = documentreading.SaveReadResult(ctx, s.store, fileID, result)
		}
	}()
}

func (s *Service) saveSessionFileReadFailure(ctx context.Context, fileID, message string) {
	if s == nil || s.store == nil {
		return
	}
	if err := documentreading.SaveReadFailure(ctx, s.store, fileID, message); err != nil {
		log.Printf("[files] store document read failure failed for %s: %v", fileID, err)
	}
}

// ListSessionFiles returns all active files attached to a session.
func (s *Service) ListSessionFiles(ctx context.Context, principal *backendauth.Principal, sessionID string) ([]File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	records, err := s.files.ListBySessionID(ctx, sessionID)
	if err != nil {
		return nil, bkerr.Internal("list session files: "+err.Error(), err)
	}
	result := make([]File, 0, len(records))
	for _, r := range records {
		result = append(result, *s.enrichDocumentReadMetadata(ctx, fileFromDB(r)))
	}
	return result, nil
}

// AttachToMessage records that fileIDs belong to the user message at
// messageIndex within sessionID, so the transcript can still show them once
// the sender's in-memory optimistic attachment state is gone.
func (s *Service) AttachToMessage(ctx context.Context, fileIDs []string, sessionID string, messageIndex int) error {
	if s == nil || s.files == nil {
		return bkerr.Unavailable("file store not configured", nil)
	}
	if err := s.files.AttachToMessage(ctx, fileIDs, sessionID, messageIndex); err != nil {
		return bkerr.Internal("attach files to message: "+err.Error(), err)
	}
	return nil
}

// ListMessageAttachments returns every file in sessionID that's been
// associated with a specific sent message via AttachToMessage.
func (s *Service) ListMessageAttachments(ctx context.Context, sessionID string) ([]File, error) {
	if s == nil || s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	records, err := s.files.ListMessageAttachments(ctx, sessionID)
	if err != nil {
		return nil, bkerr.Internal("list message attachments: "+err.Error(), err)
	}
	result := make([]File, 0, len(records))
	for _, r := range records {
		result = append(result, *s.enrichDocumentReadMetadata(ctx, fileFromDB(r)))
	}
	return result, nil
}

// safeFilePath returns a collision-safe absolute path for filename inside dir.
// If the file already exists it appends -1, -2, … before the extension.
func safeFilePath(dir, filename string) string {
	base := filepath.Base(filepath.Clean(filename))
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	candidate := filepath.Join(dir, base)
	for i := 1; i <= 999; i++ {
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
		candidate = filepath.Join(dir, fmt.Sprintf("%s-%d%s", stem, i, ext))
	}
	return candidate
}

func newBlobID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		// fallback: sha256 of rand failure is still unique enough for blob keys
		h := sha256.Sum256([]byte(fmt.Sprintf("fallback-%p", &b)))
		return hex.EncodeToString(h[:12])
	}
	return hex.EncodeToString(b[:])
}
