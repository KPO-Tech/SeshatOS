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
	IngestionJobStatusPending   = "pending"
	IngestionJobStatusRunning   = "running"
	IngestionJobStatusFailed    = "failed"
	IngestionJobStatusCompleted = "completed"
	IngestionJobStatusSkipped   = "skipped"
)

type KnowledgeIngestionJob struct {
	ID           string
	CorpusID     string
	FileID       string
	UserID       string
	WorkspaceID  string
	Filename     string
	Status       string
	AttemptCount int
	MaxAttempts  int
	ChunkCount   int
	LastError    string
	ErrorLog     string
	NextRunAt    *time.Time
	StartedAt    *time.Time
	CompletedAt  *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type CreateKnowledgeIngestionJobParams struct {
	CorpusID    string
	FileID      string
	UserID      string
	WorkspaceID string
	Filename    string
	MaxAttempts int
}

type gKnowledgeIngestionJob struct {
	ID              string  `gorm:"primaryKey;size:64"`
	CorpusID        string  `gorm:"column:corpus_id;size:64;not null;index"`
	FileID          string  `gorm:"column:file_id;size:64;not null;index"`
	UserID          string  `gorm:"column:user_id;size:64;not null;index"`
	WorkspaceID     *string `gorm:"column:workspace_id;size:64;index"`
	Filename        string  `gorm:"column:filename;not null;default:''"`
	Status          string  `gorm:"column:status;not null;default:'pending';index"`
	AttemptCount    int     `gorm:"column:attempt_count;not null;default:0"`
	MaxAttempts     int     `gorm:"column:max_attempts;not null;default:3"`
	ChunkCount      int     `gorm:"column:chunk_count;not null;default:0"`
	LastError       string  `gorm:"column:last_error;type:text;not null;default:''"`
	ErrorLog        string  `gorm:"column:error_log;type:text;not null;default:''"`
	NextRunAtUnix   *int64  `gorm:"column:next_run_at_unix;index"`
	StartedAtUnix   *int64  `gorm:"column:started_at_unix"`
	CompletedAtUnix *int64  `gorm:"column:completed_at_unix"`
	CreatedAtUnix   int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix   int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gKnowledgeIngestionJob) TableName() string { return "knowledge_ingestion_jobs" }

func knowledgeIngestionJobFromGorm(g gKnowledgeIngestionJob) KnowledgeIngestionJob {
	job := KnowledgeIngestionJob{
		ID:           g.ID,
		CorpusID:     g.CorpusID,
		FileID:       g.FileID,
		UserID:       g.UserID,
		Filename:     g.Filename,
		Status:       g.Status,
		AttemptCount: g.AttemptCount,
		MaxAttempts:  g.MaxAttempts,
		ChunkCount:   g.ChunkCount,
		LastError:    g.LastError,
		ErrorLog:     g.ErrorLog,
		CreatedAt:    time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt:    time.Unix(g.UpdatedAtUnix, 0).UTC(),
	}
	if g.WorkspaceID != nil {
		job.WorkspaceID = *g.WorkspaceID
	}
	if g.NextRunAtUnix != nil {
		t := time.Unix(*g.NextRunAtUnix, 0).UTC()
		job.NextRunAt = &t
	}
	if g.StartedAtUnix != nil {
		t := time.Unix(*g.StartedAtUnix, 0).UTC()
		job.StartedAt = &t
	}
	if g.CompletedAtUnix != nil {
		t := time.Unix(*g.CompletedAtUnix, 0).UTC()
		job.CompletedAt = &t
	}
	return job
}

type KnowledgeIngestionJobStore struct {
	db *DB
}

func NewKnowledgeIngestionJobStore(database *DB) (*KnowledgeIngestionJobStore, error) {
	if database == nil {
		return nil, fmt.Errorf("database is required")
	}
	return &KnowledgeIngestionJobStore{db: database}, nil
}

func (s *KnowledgeIngestionJobStore) Create(ctx context.Context, params CreateKnowledgeIngestionJobParams) (*KnowledgeIngestionJob, error) {
	if strings.TrimSpace(params.CorpusID) == "" {
		return nil, fmt.Errorf("corpus_id is required")
	}
	if strings.TrimSpace(params.FileID) == "" {
		return nil, fmt.Errorf("file_id is required")
	}
	if strings.TrimSpace(params.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	maxAttempts := params.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = 3
	}
	now := time.Now().UTC()
	row := gKnowledgeIngestionJob{
		ID:            newIdentityID("ing"),
		CorpusID:      params.CorpusID,
		FileID:        params.FileID,
		UserID:        params.UserID,
		Filename:      params.Filename,
		Status:        IngestionJobStatusPending,
		MaxAttempts:   maxAttempts,
		CreatedAtUnix: now.Unix(),
		UpdatedAtUnix: now.Unix(),
	}
	if strings.TrimSpace(params.WorkspaceID) != "" {
		row.WorkspaceID = &params.WorkspaceID
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create ingestion job: %w", err)
	}
	job := knowledgeIngestionJobFromGorm(row)
	return &job, nil
}

func (s *KnowledgeIngestionJobStore) FindActiveByCorpusFile(ctx context.Context, corpusID, fileID string) (*KnowledgeIngestionJob, error) {
	var row gKnowledgeIngestionJob
	err := s.db.GormDB().WithContext(ctx).
		Where("corpus_id = ? AND file_id = ? AND status IN ?", corpusID, fileID, []string{IngestionJobStatusPending, IngestionJobStatusRunning}).
		Order("created_at_unix DESC").
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("find active ingestion job: %w", err)
	}
	job := knowledgeIngestionJobFromGorm(row)
	return &job, nil
}

func (s *KnowledgeIngestionJobStore) GetByID(ctx context.Context, id string) (*KnowledgeIngestionJob, error) {
	var row gKnowledgeIngestionJob
	err := s.db.GormDB().WithContext(ctx).
		Where("id = ?", id).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("ingestion job not found")
		}
		return nil, fmt.Errorf("get ingestion job: %w", err)
	}
	job := knowledgeIngestionJobFromGorm(row)
	return &job, nil
}

func (s *KnowledgeIngestionJobStore) ListByCorpusID(ctx context.Context, corpusID string) ([]KnowledgeIngestionJob, error) {
	var rows []gKnowledgeIngestionJob
	if err := s.db.GormDB().WithContext(ctx).
		Where("corpus_id = ?", corpusID).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list ingestion jobs: %w", err)
	}
	result := make([]KnowledgeIngestionJob, 0, len(rows))
	for _, row := range rows {
		result = append(result, knowledgeIngestionJobFromGorm(row))
	}
	return result, nil
}

func (s *KnowledgeIngestionJobStore) ClaimNextDue(ctx context.Context, staleAfter time.Duration) (*KnowledgeIngestionJob, error) {
	now := time.Now().UTC()
	var claimed *KnowledgeIngestionJob
	err := s.db.GormDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		requeueBefore := now.Add(-staleAfter).Unix()
		if staleAfter > 0 {
			if err := tx.Model(&gKnowledgeIngestionJob{}).
				Where("status = ? AND started_at_unix IS NOT NULL AND started_at_unix <= ?", IngestionJobStatusRunning, requeueBefore).
				Updates(map[string]any{
					"status":           IngestionJobStatusPending,
					"next_run_at_unix": now.Unix(),
					"updated_at_unix":  now.Unix(),
				}).Error; err != nil {
				return fmt.Errorf("requeue stale ingestion jobs: %w", err)
			}
		}

		var row gKnowledgeIngestionJob
		err := tx.Where("status = ? AND (next_run_at_unix IS NULL OR next_run_at_unix <= ?)", IngestionJobStatusPending, now.Unix()).
			Order("created_at_unix ASC").
			First(&row).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return fmt.Errorf("select due ingestion job: %w", err)
		}

		attemptCount := row.AttemptCount + 1
		updates := map[string]any{
			"status":            IngestionJobStatusRunning,
			"attempt_count":     attemptCount,
			"started_at_unix":   now.Unix(),
			"updated_at_unix":   now.Unix(),
			"last_error":        "",
			"completed_at_unix": nil,
		}
		result := tx.Model(&gKnowledgeIngestionJob{}).
			Where("id = ? AND status = ? AND attempt_count = ?", row.ID, IngestionJobStatusPending, row.AttemptCount).
			Updates(updates)
		if result.Error != nil {
			return fmt.Errorf("claim ingestion job: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return nil
		}
		row.Status = IngestionJobStatusRunning
		row.AttemptCount = attemptCount
		started := now.Unix()
		row.StartedAtUnix = &started
		row.UpdatedAtUnix = now.Unix()
		row.LastError = ""
		row.CompletedAtUnix = nil
		job := knowledgeIngestionJobFromGorm(row)
		claimed = &job
		return nil
	})
	if err != nil {
		return nil, err
	}
	return claimed, nil
}

func (s *KnowledgeIngestionJobStore) MarkCompleted(ctx context.Context, id string, chunkCount int) error {
	now := time.Now().UTC().Unix()
	return s.db.GormDB().WithContext(ctx).
		Model(&gKnowledgeIngestionJob{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":            IngestionJobStatusCompleted,
			"chunk_count":       chunkCount,
			"last_error":        "",
			"next_run_at_unix":  nil,
			"completed_at_unix": now,
			"updated_at_unix":   now,
		}).Error
}

func (s *KnowledgeIngestionJobStore) MarkSkipped(ctx context.Context, id, reason string) error {
	now := time.Now().UTC().Unix()
	return s.db.GormDB().WithContext(ctx).
		Model(&gKnowledgeIngestionJob{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":            IngestionJobStatusSkipped,
			"chunk_count":       0,
			"last_error":        strings.TrimSpace(reason),
			"next_run_at_unix":  nil,
			"completed_at_unix": now,
			"updated_at_unix":   now,
		}).Error
}

func (s *KnowledgeIngestionJobStore) MarkFailed(ctx context.Context, job KnowledgeIngestionJob, failure error, retryDelay time.Duration) error {
	now := time.Now().UTC()
	lastError := ""
	if failure != nil {
		lastError = failure.Error()
	}
	errorLog := appendErrorLog(job.ErrorLog, now, lastError)
	updates := map[string]any{
		"last_error":      lastError,
		"error_log":       errorLog,
		"updated_at_unix": now.Unix(),
	}
	if job.AttemptCount >= job.MaxAttempts {
		updates["status"] = IngestionJobStatusFailed
		updates["next_run_at_unix"] = nil
	} else {
		nextRun := now.Add(retryDelay).Unix()
		updates["status"] = IngestionJobStatusPending
		updates["next_run_at_unix"] = nextRun
	}
	return s.db.GormDB().WithContext(ctx).
		Model(&gKnowledgeIngestionJob{}).
		Where("id = ?", job.ID).
		Updates(updates).Error
}

func (s *KnowledgeIngestionJobStore) ResetForRetry(ctx context.Context, id string) (*KnowledgeIngestionJob, error) {
	now := time.Now().UTC().Unix()
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gKnowledgeIngestionJob{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":            IngestionJobStatusPending,
			"attempt_count":     0,
			"chunk_count":       0,
			"last_error":        "",
			"next_run_at_unix":  now,
			"started_at_unix":   nil,
			"completed_at_unix": nil,
			"updated_at_unix":   now,
		}).Error; err != nil {
		return nil, fmt.Errorf("reset ingestion job for retry: %w", err)
	}
	return s.GetByID(ctx, id)
}

func appendErrorLog(existing string, now time.Time, msg string) string {
	line := fmt.Sprintf("[%s] %s", now.Format(time.RFC3339), strings.TrimSpace(msg))
	if strings.TrimSpace(existing) == "" {
		return line
	}
	return existing + "\n" + line
}
