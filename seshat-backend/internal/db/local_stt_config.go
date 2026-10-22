package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const localSTTConfigID = "default"

type gLocalSTTConfig struct {
	ID            string `gorm:"primaryKey;size:64"`
	BaseURL       string `gorm:"column:base_url;type:text;not null;default:''"`
	Enabled       bool   `gorm:"column:enabled;not null;default:false"`
	Language      string `gorm:"column:language;size:16;not null;default:''"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gLocalSTTConfig) TableName() string { return "local_stt_config" }

// LocalSTTConfig is the persisted pointer to a locally running whisper.cpp
// server, set by the Electron main process once it has downloaded the
// binary/model and spawned whisper-server (see the desktop app's whisper manager).
// Empty BaseURL or Enabled=false means "no local server available" - the
// caller falls back to a configured cloud provider.
type LocalSTTConfig struct {
	BaseURL string
	Enabled bool
	// Language is the spoken language dictation and the agent's transcription are asked to expect (an IETF tag such as fr); empty detects it.
	// It applies to a cloud provider as well as to the local server.
	Language  string
	UpdatedAt time.Time
	CreatedAt time.Time
}

// UpsertLocalSTTConfigParams changes only the fields that are set: the desktop saves the server address and the person's language
// separately, and neither must erase the other.
type UpsertLocalSTTConfigParams struct {
	BaseURL  *string
	Enabled  *bool
	Language *string
}

type LocalSTTConfigStore struct {
	db *DB
}

func NewLocalSTTConfigStore(database *DB) (*LocalSTTConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("local stt config store: database is required")
	}
	return &LocalSTTConfigStore{db: database}, nil
}

func (s *LocalSTTConfigStore) Get(ctx context.Context) (*LocalSTTConfig, error) {
	var row gLocalSTTConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", localSTTConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg := localSTTConfigFromModel(row)
	return &cfg, nil
}

func (s *LocalSTTConfigStore) Upsert(ctx context.Context, p UpsertLocalSTTConfigParams) (*LocalSTTConfig, error) {
	var row gLocalSTTConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", localSTTConfigID).First(&row).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = gLocalSTTConfig{ID: localSTTConfigID}
		if p.BaseURL != nil {
			row.BaseURL = strings.TrimSpace(*p.BaseURL)
		}
		if p.Enabled != nil {
			row.Enabled = *p.Enabled
		}
		if p.Language != nil {
			row.Language = strings.TrimSpace(*p.Language)
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		cfg := localSTTConfigFromModel(row)
		return &cfg, nil
	}
	if err != nil {
		return nil, err
	}

	updates := map[string]any{}
	if p.BaseURL != nil {
		updates["base_url"] = strings.TrimSpace(*p.BaseURL)
	}
	if p.Enabled != nil {
		updates["enabled"] = *p.Enabled
	}
	if p.Language != nil {
		updates["language"] = strings.TrimSpace(*p.Language)
	}
	if len(updates) == 0 {
		return s.Get(ctx)
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gLocalSTTConfig{}).
		Where("id = ?", localSTTConfigID).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	return s.Get(ctx)
}

func localSTTConfigFromModel(row gLocalSTTConfig) LocalSTTConfig {
	return LocalSTTConfig{
		BaseURL:   row.BaseURL,
		Enabled:   row.Enabled,
		Language:  row.Language,
		UpdatedAt: time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt: time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
}
