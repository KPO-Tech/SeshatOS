package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	CorpusStatusActive       = "active"
	CorpusFileStatusPending  = "pending"
	CorpusFileStatusIngested = "ingested"
	CorpusFileStatusFailed   = "failed"
)

// ─── Public types ─────────────────────────────────────────────────────────────

type Corpus struct {
	ID          string
	UserID      string
	WorkspaceID string
	Name        string
	Description string
	Status      string
	ChunkCount  int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type CorpusFile struct {
	CorpusID   string
	FileID     string
	Filename   string
	Status     string // pending / ingested / failed
	ChunkCount int
	IngestedAt *time.Time
	CreatedAt  time.Time
}

type CreateCorpusParams struct {
	UserID      string
	WorkspaceID string // optional
	Name        string
	Description string
}

type UpdateCorpusParams struct {
	Name        string
	Description string
}

type UpsertCorpusFileParams struct {
	CorpusID   string
	FileID     string
	Filename   string
	Status     string
	ChunkCount int
}

// ─── GORM private models ─────────────────────────────────────────────────────

type gCorpus struct {
	ID            string  `gorm:"primaryKey;size:64"`
	UserID        string  `gorm:"column:user_id;size:64;not null;index"`
	WorkspaceID   *string `gorm:"column:workspace_id;size:64;index"`
	Name          string  `gorm:"not null"`
	Description   string  `gorm:"not null;default:''"`
	Status        string  `gorm:"not null;default:'active';index"`
	ChunkCount    int     `gorm:"column:chunk_count;not null;default:0"`
	CreatedAtUnix int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gCorpus) TableName() string { return "corpora" }

type gCorpusFile struct {
	CorpusID       string `gorm:"primaryKey;size:64;column:corpus_id"`
	FileID         string `gorm:"primaryKey;size:64;column:file_id"`
	Filename       string `gorm:"not null;default:''"`
	Status         string `gorm:"not null;default:'pending';index"`
	ChunkCount     int    `gorm:"column:chunk_count;not null;default:0"`
	IngestedAtUnix *int64 `gorm:"column:ingested_at_unix"`
	CreatedAtUnix  int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gCorpusFile) TableName() string { return "corpus_files" }

// ─── Converters ───────────────────────────────────────────────────────────────

func corpusFromGorm(g gCorpus) Corpus {
	c := Corpus{
		ID:          g.ID,
		UserID:      g.UserID,
		Name:        g.Name,
		Description: g.Description,
		Status:      g.Status,
		ChunkCount:  g.ChunkCount,
		CreatedAt:   time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt:   time.Unix(g.UpdatedAtUnix, 0).UTC(),
	}
	if g.WorkspaceID != nil {
		c.WorkspaceID = *g.WorkspaceID
	}
	return c
}

func corpusFileFromGorm(g gCorpusFile) CorpusFile {
	cf := CorpusFile{
		CorpusID:   g.CorpusID,
		FileID:     g.FileID,
		Filename:   g.Filename,
		Status:     g.Status,
		ChunkCount: g.ChunkCount,
		CreatedAt:  time.Unix(g.CreatedAtUnix, 0).UTC(),
	}
	if g.IngestedAtUnix != nil {
		t := time.Unix(*g.IngestedAtUnix, 0).UTC()
		cf.IngestedAt = &t
	}
	return cf
}

// ─── CorpusStore ──────────────────────────────────────────────────────────────

type CorpusStore struct {
	db *DB
}

func NewCorpusStore(database *DB) (*CorpusStore, error) {
	if database == nil {
		return nil, fmt.Errorf("database is required")
	}
	return &CorpusStore{db: database}, nil
}

func (s *CorpusStore) Create(ctx context.Context, params CreateCorpusParams) (*Corpus, error) {
	if strings.TrimSpace(params.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(params.Name) == "" {
		return nil, fmt.Errorf("name is required")
	}
	now := time.Now().UTC()
	row := gCorpus{
		ID:            newIdentityID("corp"),
		UserID:        params.UserID,
		Name:          params.Name,
		Description:   params.Description,
		Status:        CorpusStatusActive,
		CreatedAtUnix: now.Unix(),
		UpdatedAtUnix: now.Unix(),
	}
	if params.WorkspaceID != "" {
		row.WorkspaceID = &params.WorkspaceID
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create corpus: %w", err)
	}
	c := corpusFromGorm(row)
	return &c, nil
}

func (s *CorpusStore) GetByID(ctx context.Context, id string) (*Corpus, error) {
	var row gCorpus
	err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("corpus not found")
		}
		return nil, fmt.Errorf("get corpus: %w", err)
	}
	c := corpusFromGorm(row)
	return &c, nil
}

func (s *CorpusStore) Update(ctx context.Context, id string, params UpdateCorpusParams) (*Corpus, error) {
	if strings.TrimSpace(id) == "" {
		return nil, fmt.Errorf("id is required")
	}
	updates := map[string]any{}
	if strings.TrimSpace(params.Name) != "" {
		updates["name"] = params.Name
	}
	updates["description"] = params.Description
	if len(updates) == 0 {
		return s.GetByID(ctx, id)
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gCorpus{}).
		Where("id = ?", id).
		Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update corpus: %w", err)
	}
	return s.GetByID(ctx, id)
}

func (s *CorpusStore) ListByUserID(ctx context.Context, userID string) ([]Corpus, error) {
	var rows []gCorpus
	if err := s.db.GormDB().WithContext(ctx).
		Where("user_id = ? AND status = ?", userID, CorpusStatusActive).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list corpora by user: %w", err)
	}
	results := make([]Corpus, 0, len(rows))
	for _, r := range rows {
		results = append(results, corpusFromGorm(r))
	}
	return results, nil
}

func (s *CorpusStore) ListAll(ctx context.Context) ([]Corpus, error) {
	var rows []gCorpus
	if err := s.db.GormDB().WithContext(ctx).
		Where("status = ?", CorpusStatusActive).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list all corpora: %w", err)
	}
	results := make([]Corpus, 0, len(rows))
	for _, r := range rows {
		results = append(results, corpusFromGorm(r))
	}
	return results, nil
}

func (s *CorpusStore) Delete(ctx context.Context, id string) error {
	return s.db.GormDB().WithContext(ctx).
		Delete(&gCorpus{}, "id = ?", id).Error
}

// AddFile records a file attachment to a corpus (idempotent via OnConflict).
func (s *CorpusStore) AddFile(ctx context.Context, params UpsertCorpusFileParams) (*CorpusFile, error) {
	if strings.TrimSpace(params.CorpusID) == "" {
		return nil, fmt.Errorf("corpus_id is required")
	}
	if strings.TrimSpace(params.FileID) == "" {
		return nil, fmt.Errorf("file_id is required")
	}
	status := params.Status
	if status == "" {
		status = CorpusFileStatusPending
	}
	now := time.Now().UTC()
	row := gCorpusFile{
		CorpusID:      params.CorpusID,
		FileID:        params.FileID,
		Filename:      params.Filename,
		Status:        status,
		ChunkCount:    params.ChunkCount,
		CreatedAtUnix: now.Unix(),
	}
	if err := s.db.GormDB().WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&row).Error; err != nil {
		return nil, fmt.Errorf("add file to corpus: %w", err)
	}
	cf := corpusFileFromGorm(row)
	return &cf, nil
}

// UpdateFileStatus updates the ingest status for a corpus file record.
func (s *CorpusStore) UpdateFileStatus(ctx context.Context, corpusID, fileID, status string, chunkCount int) error {
	updates := map[string]any{
		"status":      status,
		"chunk_count": chunkCount,
	}
	if status == CorpusFileStatusIngested {
		now := time.Now().UTC().Unix()
		updates["ingested_at_unix"] = now
	}
	return s.db.GormDB().WithContext(ctx).
		Model(&gCorpusFile{}).
		Where("corpus_id = ? AND file_id = ?", corpusID, fileID).
		Updates(updates).Error
}

// IncrementChunkCount adds delta to a corpus's total chunk count.
func (s *CorpusStore) IncrementChunkCount(ctx context.Context, corpusID string, delta int) error {
	return s.db.GormDB().WithContext(ctx).
		Model(&gCorpus{}).
		Where("id = ?", corpusID).
		UpdateColumn("chunk_count", gorm.Expr("chunk_count + ?", delta)).Error
}

func (s *CorpusStore) ListFiles(ctx context.Context, corpusID string) ([]CorpusFile, error) {
	var rows []gCorpusFile
	if err := s.db.GormDB().WithContext(ctx).
		Where("corpus_id = ?", corpusID).
		Order("created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list corpus files: %w", err)
	}
	results := make([]CorpusFile, 0, len(rows))
	for _, r := range rows {
		results = append(results, corpusFileFromGorm(r))
	}
	return results, nil
}

func (s *CorpusStore) RemoveFile(ctx context.Context, corpusID, fileID string) error {
	return s.RemoveFileAndAdjustChunks(ctx, corpusID, fileID, 0)
}

func (s *CorpusStore) RemoveFileAndAdjustChunks(ctx context.Context, corpusID, fileID string, chunkCount int) error {
	return s.db.GormDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Delete(&gCorpusFile{}, "corpus_id = ? AND file_id = ?", corpusID, fileID)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return fmt.Errorf("corpus file not found")
		}
		if chunkCount <= 0 {
			return nil
		}
		return tx.Model(&gCorpus{}).
			Where("id = ?", corpusID).
			UpdateColumn("chunk_count", gorm.Expr("CASE WHEN chunk_count >= ? THEN chunk_count - ? ELSE 0 END", chunkCount, chunkCount)).Error
	})
}

func (s *CorpusStore) GetFile(ctx context.Context, corpusID, fileID string) (*CorpusFile, error) {
	var row gCorpusFile
	err := s.db.GormDB().WithContext(ctx).
		Where("corpus_id = ? AND file_id = ?", corpusID, fileID).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("corpus file not found")
		}
		return nil, fmt.Errorf("get corpus file: %w", err)
	}
	cf := corpusFileFromGorm(row)
	return &cf, nil
}
