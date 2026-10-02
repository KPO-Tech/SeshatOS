package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const localTitleConfigID = "default"

type gLocalTitleConfig struct {
	ID            string `gorm:"primaryKey;size:64"`
	BaseURL       string `gorm:"column:base_url;type:text;not null;default:''"`
	Model         string `gorm:"column:model;type:text;not null;default:''"`
	Enabled       bool   `gorm:"column:enabled;not null;default:false"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gLocalTitleConfig) TableName() string { return "local_title_config" }

// LocalTitleConfig points session title generation at a small local model
// served over an OpenAI-compatible API (llama.cpp's llama-server, started by the
// Electron main process). Enabled=false or an empty BaseURL means titles fall
// back to the chat provider.
type LocalTitleConfig struct {
	BaseURL   string
	Model     string
	Enabled   bool
	UpdatedAt time.Time
	CreatedAt time.Time
}

type UpsertLocalTitleConfigParams struct {
	BaseURL string
	Model   string
	Enabled bool
}

type LocalTitleConfigStore struct {
	db *DB
}

func NewLocalTitleConfigStore(database *DB) (*LocalTitleConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("local title config store: database is required")
	}
	return &LocalTitleConfigStore{db: database}, nil
}

func (s *LocalTitleConfigStore) Get(ctx context.Context) (*LocalTitleConfig, error) {
	var row gLocalTitleConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", localTitleConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg := localTitleConfigFromModel(row)
	return &cfg, nil
}

func (s *LocalTitleConfigStore) Upsert(ctx context.Context, p UpsertLocalTitleConfigParams) (*LocalTitleConfig, error) {
	row := gLocalTitleConfig{
		ID:      localTitleConfigID,
		BaseURL: strings.TrimSpace(p.BaseURL),
		Model:   strings.TrimSpace(p.Model),
		Enabled: p.Enabled,
	}
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", localTitleConfigID).First(&gLocalTitleConfig{}).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	default:
		if err := s.db.gormDB.WithContext(ctx).
			Model(&gLocalTitleConfig{}).
			Where("id = ?", localTitleConfigID).
			Updates(map[string]any{"base_url": row.BaseURL, "model": row.Model, "enabled": row.Enabled}).Error; err != nil {
			return nil, err
		}
	}
	return s.Get(ctx)
}

func localTitleConfigFromModel(row gLocalTitleConfig) LocalTitleConfig {
	return LocalTitleConfig{
		BaseURL:   row.BaseURL,
		Model:     row.Model,
		Enabled:   row.Enabled,
		UpdatedAt: time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt: time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
}
