package db

import (
	"context"
	"fmt"
	"time"

	"gorm.io/gorm"
)

const (
	PlanStatusPending   = "pending"
	PlanStatusValidated = "validated"
	PlanStatusRejected  = "rejected"
)

type gPlanDocument struct {
	ID            string `gorm:"primaryKey;size:64"`
	SessionID     string `gorm:"column:session_id;size:64;not null;index"`
	UserID        string `gorm:"column:user_id;size:64;not null;index"`
	Slug          string `gorm:"column:slug;size:255;not null;default:''"`
	Filename      string `gorm:"column:filename;size:255;not null;default:''"`
	Content       string `gorm:"column:content;type:text;not null;default:''"`
	Status        string `gorm:"column:status;size:32;not null;default:'pending'"`
	Version       int    `gorm:"column:version;not null;default:1"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gPlanDocument) TableName() string { return "plan_documents" }

type PlanDocument struct {
	ID        string
	SessionID string
	UserID    string
	Slug      string
	Filename  string
	Content   string
	Status    string
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

type CreatePlanParams struct {
	ID        string
	SessionID string
	UserID    string
	Slug      string
	Filename  string
	Content   string
}

type UpdatePlanContentParams struct {
	Content string
}

type PlanDocumentStore struct {
	db *DB
}

func NewPlanDocumentStore(database *DB) (*PlanDocumentStore, error) {
	if database == nil {
		return nil, fmt.Errorf("plan document store: database is required")
	}
	return &PlanDocumentStore{db: database}, nil
}

func (s *PlanDocumentStore) Create(ctx context.Context, p CreatePlanParams) (*PlanDocument, error) {
	row := gPlanDocument{
		ID:        p.ID,
		SessionID: p.SessionID,
		UserID:    p.UserID,
		Slug:      p.Slug,
		Filename:  p.Filename,
		Content:   p.Content,
		Status:    PlanStatusPending,
		Version:   1,
	}
	if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create plan document: %w", err)
	}
	return toPublicPlan(row), nil
}

func (s *PlanDocumentStore) Get(ctx context.Context, planID string) (*PlanDocument, error) {
	var row gPlanDocument
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", planID).First(&row).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get plan document: %w", err)
	}
	return toPublicPlan(row), nil
}

func (s *PlanDocumentStore) ListBySession(ctx context.Context, sessionID string) ([]*PlanDocument, error) {
	var rows []gPlanDocument
	if err := s.db.gormDB.WithContext(ctx).
		Where("session_id = ?", sessionID).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list plans for session: %w", err)
	}
	out := make([]*PlanDocument, len(rows))
	for i, r := range rows {
		out[i] = toPublicPlan(r)
	}
	return out, nil
}

func (s *PlanDocumentStore) ListBySessionAndUser(ctx context.Context, sessionID, userID string) ([]*PlanDocument, error) {
	var rows []gPlanDocument
	if err := s.db.gormDB.WithContext(ctx).
		Where("session_id = ? AND user_id = ?", sessionID, userID).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list plans for session and user: %w", err)
	}
	out := make([]*PlanDocument, len(rows))
	for i, r := range rows {
		out[i] = toPublicPlan(r)
	}
	return out, nil
}

func (s *PlanDocumentStore) UpdateContent(ctx context.Context, planID string, content string) (*PlanDocument, error) {
	result := s.db.gormDB.WithContext(ctx).
		Model(&gPlanDocument{}).
		Where("id = ?", planID).
		Updates(map[string]any{
			"content": content,
			"version": gorm.Expr("version + 1"),
		})
	if result.Error != nil {
		return nil, fmt.Errorf("update plan content: %w", result.Error)
	}
	return s.Get(ctx, planID)
}

func (s *PlanDocumentStore) SetStatus(ctx context.Context, planID string, status string) error {
	result := s.db.gormDB.WithContext(ctx).
		Model(&gPlanDocument{}).
		Where("id = ?", planID).
		Update("status", status)
	return result.Error
}

func (s *PlanDocumentStore) Upsert(ctx context.Context, p CreatePlanParams) (*PlanDocument, error) {
	var existing gPlanDocument
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", p.ID).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		return s.Create(ctx, p)
	}
	if err != nil {
		return nil, fmt.Errorf("upsert plan: lookup: %w", err)
	}
	result := s.db.gormDB.WithContext(ctx).
		Model(&gPlanDocument{}).
		Where("id = ?", p.ID).
		Updates(map[string]any{
			"content":  p.Content,
			"slug":     p.Slug,
			"filename": p.Filename,
			"status":   PlanStatusPending,
			"version":  gorm.Expr("version + 1"),
		})
	if result.Error != nil {
		return nil, fmt.Errorf("upsert plan: update: %w", result.Error)
	}
	return s.Get(ctx, p.ID)
}

func toPublicPlan(r gPlanDocument) *PlanDocument {
	return &PlanDocument{
		ID:        r.ID,
		SessionID: r.SessionID,
		UserID:    r.UserID,
		Slug:      r.Slug,
		Filename:  r.Filename,
		Content:   r.Content,
		Status:    r.Status,
		Version:   r.Version,
		CreatedAt: time.Unix(r.CreatedAtUnix, 0),
		UpdatedAt: time.Unix(r.UpdatedAtUnix, 0),
	}
}
