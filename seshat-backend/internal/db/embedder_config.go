package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const embedderConfigID = "default"

type gEmbedderConfig struct {
	ID              string `gorm:"primaryKey;size:64"`
	Provider        string `gorm:"column:provider;size:64;not null;default:'openai'"`
	BaseURL         string `gorm:"column:base_url;type:text;not null;default:''"`
	APIKeyEncrypted string `gorm:"column:api_key_encrypted;type:text;not null;default:''"`
	Model           string `gorm:"column:model;size:256;not null;default:''"`
	Enabled         bool   `gorm:"column:enabled;not null;default:true"`
	UpdatedAtUnix   int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix   int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gEmbedderConfig) TableName() string { return "embedder_config" }

type EmbedderConfig struct {
	Provider  string
	BaseURL   string
	Model     string
	HasAPIKey bool
	Enabled   bool
	UpdatedAt time.Time
	CreatedAt time.Time
}

type UpsertEmbedderConfigParams struct {
	Provider string
	BaseURL  string
	APIKey   *string // nil = keep existing; ptr-to-"" = clear
	Model    string
	Enabled  bool
}

type EmbedderConfigStore struct {
	db *DB
}

func NewEmbedderConfigStore(database *DB) (*EmbedderConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("embedder config store: database is required")
	}
	return &EmbedderConfigStore{db: database}, nil
}

func (s *EmbedderConfigStore) Get(ctx context.Context) (*EmbedderConfig, error) {
	var row gEmbedderConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", embedderConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg := embedderConfigFromModel(row)
	return &cfg, nil
}

func (s *EmbedderConfigStore) GetDecryptedAPIKey(ctx context.Context) (string, error) {
	var row gEmbedderConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", embedderConfigID).First(&row).Error
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

func (s *EmbedderConfigStore) Upsert(ctx context.Context, p UpsertEmbedderConfigParams) (*EmbedderConfig, error) {
	provider := strings.ToLower(strings.TrimSpace(p.Provider))
	if provider == "" {
		provider = "openai"
	}

	var encryptedKey string
	if p.APIKey != nil {
		if *p.APIKey != "" {
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
		// ptr-to-"" means clear
	}

	var row gEmbedderConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", embedderConfigID).First(&row).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = gEmbedderConfig{
			ID:              embedderConfigID,
			Provider:        provider,
			BaseURL:         strings.TrimSpace(p.BaseURL),
			APIKeyEncrypted: encryptedKey,
			Model:           strings.TrimSpace(p.Model),
			Enabled:         p.Enabled,
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		cfg := embedderConfigFromModel(row)
		return &cfg, nil
	}
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"provider": provider,
		"base_url": strings.TrimSpace(p.BaseURL),
		"model":    strings.TrimSpace(p.Model),
		"enabled":  p.Enabled,
	}
	if p.APIKey != nil {
		updates["api_key_encrypted"] = encryptedKey
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gEmbedderConfig{}).
		Where("id = ?", embedderConfigID).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	return s.Get(ctx)
}

func embedderConfigFromModel(row gEmbedderConfig) EmbedderConfig {
	return EmbedderConfig{
		Provider:  row.Provider,
		BaseURL:   row.BaseURL,
		Model:     row.Model,
		HasAPIKey: row.APIKeyEncrypted != "",
		Enabled:   row.Enabled,
		UpdatedAt: time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt: time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
}
