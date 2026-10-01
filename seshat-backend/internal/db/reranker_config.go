package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const rerankerConfigID = "default"

type gRerankerConfig struct {
	ID              string `gorm:"primaryKey;size:64"`
	BaseURL         string `gorm:"column:base_url;type:text;not null;default:''"`
	APIKeyEncrypted string `gorm:"column:api_key_encrypted;type:text;not null;default:''"`
	Model           string `gorm:"column:model;size:256;not null;default:''"`
	Enabled         bool   `gorm:"column:enabled;not null;default:false"`
	UpdatedAtUnix   int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix   int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gRerankerConfig) TableName() string { return "reranker_config" }

type RerankerConfig struct {
	BaseURL   string
	Model     string
	HasAPIKey bool
	Enabled   bool
	UpdatedAt time.Time
	CreatedAt time.Time
}

type UpsertRerankerConfigParams struct {
	BaseURL string
	APIKey  *string // nil = keep existing; ptr-to-"" = clear
	Model   string
	Enabled bool
}

type RerankerConfigStore struct {
	db *DB
}

func NewRerankerConfigStore(database *DB) (*RerankerConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("reranker config store: database is required")
	}
	return &RerankerConfigStore{db: database}, nil
}

func (s *RerankerConfigStore) Get(ctx context.Context) (*RerankerConfig, error) {
	var row gRerankerConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", rerankerConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg := rerankerConfigFromModel(row)
	return &cfg, nil
}

func (s *RerankerConfigStore) GetDecryptedAPIKey(ctx context.Context) (string, error) {
	var row gRerankerConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", rerankerConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if row.APIKeyEncrypted == "" {
		return "", nil
	}
	aesKey, err := loadOrCreateEncryptionKey()
	if err != nil {
		return "", err
	}
	plain, err := decryptAESGCM(aesKey, row.APIKeyEncrypted)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func (s *RerankerConfigStore) Upsert(ctx context.Context, p UpsertRerankerConfigParams) (*RerankerConfig, error) {
	var encryptedKey string
	if p.APIKey != nil && *p.APIKey != "" {
		aesKey, err := loadOrCreateEncryptionKey()
		if err != nil {
			return nil, fmt.Errorf("encryption key: %w", err)
		}
		enc, err := encryptAESGCM(aesKey, []byte(*p.APIKey))
		if err != nil {
			return nil, fmt.Errorf("encrypt api key: %w", err)
		}
		encryptedKey = enc
	}

	var row gRerankerConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", rerankerConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = gRerankerConfig{
			ID:              rerankerConfigID,
			BaseURL:         strings.TrimSpace(p.BaseURL),
			APIKeyEncrypted: encryptedKey,
			Model:           strings.TrimSpace(p.Model),
			Enabled:         p.Enabled,
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		cfg := rerankerConfigFromModel(row)
		return &cfg, nil
	}
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"base_url": strings.TrimSpace(p.BaseURL),
		"model":    strings.TrimSpace(p.Model),
		"enabled":  p.Enabled,
	}
	if p.APIKey != nil {
		updates["api_key_encrypted"] = encryptedKey
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gRerankerConfig{}).
		Where("id = ?", rerankerConfigID).
		Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.Get(ctx)
}

func rerankerConfigFromModel(row gRerankerConfig) RerankerConfig {
	return RerankerConfig{
		BaseURL:   row.BaseURL,
		Model:     row.Model,
		HasAPIKey: row.APIKeyEncrypted != "",
		Enabled:   row.Enabled,
		UpdatedAt: time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt: time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
}
