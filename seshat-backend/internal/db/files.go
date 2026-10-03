package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	FileStatusActive  = "active"
	FileStatusDeleted = "deleted"
)

// File is the product-layer record for an uploaded file.
// The blob lives in ArtifactStore; this record owns the metadata and access policy.
type File struct {
	ID          string
	UserID      string
	WorkspaceID string // empty if not workspace-scoped
	SessionID   string // empty if not session-scoped
	Category    string // "images", "documents", "audio", "other" — set for session uploads
	LocalPath   string // workspace-relative path (e.g. uploads/images/photo.jpg) — set for session uploads
	Filename    string
	ContentType string
	Size        int64
	StorageKey  string // key in ArtifactStore
	SHA256      string
	Status      string
	// UserMessageIndex, when set, is the 0-based position of this file's
	// owning user message within its session's transcript at the moment it
	// was attached to a turn. Nil until AttachToMessage records it. Callers
	// group the result by UserMessageIndex to reassemble the "which files
	// belong to which sent message" association the transcript needs to
	// keep showing attachments after a reload — nothing else records it.
	UserMessageIndex *int
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type CreateFileParams struct {
	UserID      string
	WorkspaceID string
	SessionID   string // optional; session-scoped upload
	Category    string // optional; "images", "documents", "audio", "other"
	LocalPath   string // optional; workspace-relative path
	Filename    string
	ContentType string
	Size        int64
	StorageKey  string
	SHA256      string
}

// ─── GORM private model ───────────────────────────────────────────────────────

type gFile struct {
	ID               string  `gorm:"primaryKey;size:64"`
	UserID           string  `gorm:"column:user_id;size:64;not null;index"`
	WorkspaceID      *string `gorm:"column:workspace_id;size:64;index"`
	SessionID        *string `gorm:"column:session_id;size:64;index"`
	Category         *string `gorm:"column:category;size:32"`
	LocalPath        *string `gorm:"column:local_path;size:1024"`
	Filename         string  `gorm:"not null"`
	ContentType      string  `gorm:"column:content_type;not null;default:''"`
	Size             int64   `gorm:"not null;default:0"`
	StorageKey       string  `gorm:"column:storage_key;not null"`
	SHA256           string  `gorm:"column:sha256;not null;default:''"`
	Status           string  `gorm:"not null;default:'active';index"`
	UserMessageIndex *int    `gorm:"column:user_message_index;index"`
	CreatedAtUnix    int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix    int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gFile) TableName() string { return "files" }

func fileFromGorm(g gFile) File {
	f := File{
		ID:          g.ID,
		UserID:      g.UserID,
		Filename:    g.Filename,
		ContentType: g.ContentType,
		Size:        g.Size,
		StorageKey:  g.StorageKey,
		SHA256:      g.SHA256,
		Status:      g.Status,
		CreatedAt:   time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt:   time.Unix(g.UpdatedAtUnix, 0).UTC(),
	}
	if g.WorkspaceID != nil {
		f.WorkspaceID = *g.WorkspaceID
	}
	if g.SessionID != nil {
		f.SessionID = *g.SessionID
	}
	if g.Category != nil {
		f.Category = *g.Category
	}
	if g.LocalPath != nil {
		f.LocalPath = *g.LocalPath
	}
	f.UserMessageIndex = g.UserMessageIndex
	return f
}

// ─── FileStore ────────────────────────────────────────────────────────────────

type FileStore struct {
	db *DB
}

func NewFileStore(database *DB) (*FileStore, error) {
	if database == nil {
		return nil, fmt.Errorf("database is required")
	}
	return &FileStore{db: database}, nil
}

func (s *FileStore) Create(ctx context.Context, params CreateFileParams) (*File, error) {
	if strings.TrimSpace(params.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(params.Filename) == "" {
		return nil, fmt.Errorf("filename is required")
	}
	if strings.TrimSpace(params.StorageKey) == "" {
		return nil, fmt.Errorf("storage_key is required")
	}
	now := time.Now().UTC()
	row := gFile{
		ID:            newIdentityID("file"),
		UserID:        params.UserID,
		Filename:      params.Filename,
		ContentType:   params.ContentType,
		Size:          params.Size,
		StorageKey:    params.StorageKey,
		SHA256:        params.SHA256,
		Status:        FileStatusActive,
		CreatedAtUnix: now.Unix(),
		UpdatedAtUnix: now.Unix(),
	}
	if params.WorkspaceID != "" {
		row.WorkspaceID = &params.WorkspaceID
	}
	if params.SessionID != "" {
		row.SessionID = &params.SessionID
	}
	if params.Category != "" {
		row.Category = &params.Category
	}
	if params.LocalPath != "" {
		row.LocalPath = &params.LocalPath
	}

	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create file: %w", err)
	}
	f := fileFromGorm(row)
	return &f, nil
}

func (s *FileStore) GetByID(ctx context.Context, id string) (*File, error) {
	var row gFile
	err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("file not found")
		}
		return nil, fmt.Errorf("get file by id: %w", err)
	}
	f := fileFromGorm(row)
	return &f, nil
}

func (s *FileStore) ListByUserID(ctx context.Context, userID string) ([]File, error) {
	var rows []gFile
	if err := s.db.GormDB().WithContext(ctx).
		Where("user_id = ? AND status = ?", userID, FileStatusActive).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list files by user: %w", err)
	}
	results := make([]File, 0, len(rows))
	for _, r := range rows {
		results = append(results, fileFromGorm(r))
	}
	return results, nil
}

func (s *FileStore) ListBySessionID(ctx context.Context, sessionID string) ([]File, error) {
	var rows []gFile
	if err := s.db.GormDB().WithContext(ctx).
		Where("session_id = ? AND status = ?", sessionID, FileStatusActive).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list files by session: %w", err)
	}
	results := make([]File, 0, len(rows))
	for _, r := range rows {
		results = append(results, fileFromGorm(r))
	}
	return results, nil
}

// AttachToMessage records which sent user message a set of session-scoped
// files belongs to, so the transcript can still show them after the
// in-memory optimistic attachment metadata is gone (page reload, app
// restart). messageIndex is the 0-based position of that user message
// within the session's transcript.
func (s *FileStore) AttachToMessage(ctx context.Context, fileIDs []string, sessionID string, messageIndex int) error {
	if len(fileIDs) == 0 {
		return nil
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gFile{}).
		Where("id IN ? AND session_id = ?", fileIDs, sessionID).
		Update("user_message_index", messageIndex).Error; err != nil {
		return fmt.Errorf("attach files to message: %w", err)
	}
	return nil
}

// ListMessageAttachments returns every file in a session that's been
// associated with a specific sent message via AttachToMessage, ordered by
// that association so callers can group by UserMessageIndex.
func (s *FileStore) ListMessageAttachments(ctx context.Context, sessionID string) ([]File, error) {
	var rows []gFile
	if err := s.db.GormDB().WithContext(ctx).
		Where("session_id = ? AND status = ? AND user_message_index IS NOT NULL", sessionID, FileStatusActive).
		Order("user_message_index ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list message attachments: %w", err)
	}
	results := make([]File, 0, len(rows))
	for _, r := range rows {
		results = append(results, fileFromGorm(r))
	}
	return results, nil
}

func (s *FileStore) ListByWorkspaceID(ctx context.Context, workspaceID string) ([]File, error) {
	var rows []gFile
	if err := s.db.GormDB().WithContext(ctx).
		Where("workspace_id = ? AND status = ?", workspaceID, FileStatusActive).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list files by workspace: %w", err)
	}
	results := make([]File, 0, len(rows))
	for _, r := range rows {
		results = append(results, fileFromGorm(r))
	}
	return results, nil
}

func (s *FileStore) ListAll(ctx context.Context) ([]File, error) {
	var rows []gFile
	if err := s.db.GormDB().WithContext(ctx).
		Where("status = ?", FileStatusActive).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list all files: %w", err)
	}
	results := make([]File, 0, len(rows))
	for _, r := range rows {
		results = append(results, fileFromGorm(r))
	}
	return results, nil
}

func (s *FileStore) Delete(ctx context.Context, id string) error {
	if err := s.db.GormDB().WithContext(ctx).
		Delete(&gFile{}, "id = ?", id).Error; err != nil {
		return fmt.Errorf("delete file: %w", err)
	}
	return nil
}
