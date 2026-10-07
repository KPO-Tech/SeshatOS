package files

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
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

// documentReadTimeout bounds one on-demand read for the preview.
const documentReadTimeout = 5 * time.Minute

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

	return fileFromDB(*record), nil
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
		result = append(result, *fileFromDB(r))
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
	return fileFromDB(*record), nil
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
	return data, fileFromDB(*record), nil
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
	return reader, fileFromDB(*record), nil
}

// ReadMarkdown returns the text of a document for the preview. It is read when the preview asks for it,
// not when the file is attached: attaching a file converts nothing, and the agent reads the file itself
// with its own tools. The result is kept in the store, so opening the preview again, or putting the file
// in Knowledge, does not read it twice.
func (s *Service) ReadMarkdown(ctx context.Context, principal *backendauth.Principal, fileID string) (string, *File, error) {
	if s == nil || s.files == nil {
		return "", nil, bkerr.Unavailable("file store not configured", nil)
	}
	if s.store == nil {
		return "", nil, bkerr.Unavailable("blob storage not configured", nil)
	}
	record, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return "", nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return "", nil, err
	}
	file := fileFromDB(*record)
	if markdown, ok := s.cachedReadResultMarkdown(ctx, record.ID); ok {
		return markdown, file, nil
	}

	data, err := s.store.Get(ctx, record.StorageKey)
	if err != nil {
		return "", nil, bkerr.Internal("read file blob: "+err.Error(), err)
	}
	processor := s.documentProcessor
	if processor == nil {
		processor = documentreading.NewProcessor(s.resolveDocumentConverter)
	}
	readCtx, cancel := context.WithTimeout(ctx, documentReadTimeout)
	defer cancel()
	result, ok, err := processor.ReadBytes(readCtx, documentreading.ReadInput{
		SourceFileID: record.ID,
		Filename:     record.Filename,
		ContentType:  record.ContentType,
		Data:         data,
		SHA256:       record.SHA256,
	})
	if err != nil {
		return "", nil, bkerr.Unavailable("the document could not be read: "+err.Error(), err)
	}
	if !ok || strings.TrimSpace(result.Markdown) == "" {
		return "", nil, bkerr.NotFound("this file has no text to preview", nil)
	}
	_ = documentreading.SaveReadResult(ctx, s.store, record.ID, result)
	return result.Markdown, file, nil
}

func (s *Service) cachedReadResultMarkdown(ctx context.Context, fileID string) (string, bool) {
	result, ok, err := documentreading.LoadReadResult(ctx, s.store, fileID)
	if err != nil || !ok || strings.TrimSpace(result.Markdown) == "" {
		return "", false
	}
	return result.Markdown, true
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

	return fileFromDB(*record), nil
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
		result = append(result, *fileFromDB(r))
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
		result = append(result, *fileFromDB(r))
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
