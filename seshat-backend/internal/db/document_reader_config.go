package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const documentReaderConfigID = "default"

type gDocumentReaderConfig struct {
	ID             string `gorm:"primaryKey;size:64"`
	BaseURL        string `gorm:"column:base_url;type:text;not null;default:''"`
	Enabled        bool   `gorm:"column:enabled;not null;default:true"`
	PreferExternal bool   `gorm:"column:prefer_external;not null;default:false"`
	UpdatedAtUnix  int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix  int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gDocumentReaderConfig) TableName() string { return "document_reader_config" }

// DocumentReaderConfig is the persisted, user-configurable external document
// intelligence service. Empty BaseURL means "no external service"; the local
// reader still remains available. PreferExternal flips the runtime policy from
// local-first/external-fallback to external-first/local-fallback.
type DocumentReaderConfig struct {
	BaseURL        string
	Enabled        bool
	PreferExternal bool
	UpdatedAt      time.Time
	CreatedAt      time.Time
}

type UpsertDocumentReaderConfigParams struct {
	BaseURL        string
	Enabled        bool
	PreferExternal bool
}

type DocumentReaderConfigStore struct {
	db *DB
}

func NewDocumentReaderConfigStore(database *DB) (*DocumentReaderConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("document reader config store: database is required")
	}
	return &DocumentReaderConfigStore{db: database}, nil
}

func (s *DocumentReaderConfigStore) Get(ctx context.Context) (*DocumentReaderConfig, error) {
	var row gDocumentReaderConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", documentReaderConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg := documentReaderConfigFromModel(row)
	return &cfg, nil
}

func (s *DocumentReaderConfigStore) Upsert(ctx context.Context, p UpsertDocumentReaderConfigParams) (*DocumentReaderConfig, error) {
	baseURL := strings.TrimSpace(p.BaseURL)

	var row gDocumentReaderConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", documentReaderConfigID).First(&row).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = gDocumentReaderConfig{
			ID:             documentReaderConfigID,
			BaseURL:        baseURL,
			Enabled:        p.Enabled,
			PreferExternal: p.PreferExternal,
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		cfg := documentReaderConfigFromModel(row)
		return &cfg, nil
	}
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"base_url":        baseURL,
		"enabled":         p.Enabled,
		"prefer_external": p.PreferExternal,
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gDocumentReaderConfig{}).
		Where("id = ?", documentReaderConfigID).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	return s.Get(ctx)
}

func documentReaderConfigFromModel(row gDocumentReaderConfig) DocumentReaderConfig {
	return DocumentReaderConfig{
		BaseURL:        row.BaseURL,
		Enabled:        row.Enabled,
		PreferExternal: row.PreferExternal,
		UpdatedAt:      time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt:      time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
}
