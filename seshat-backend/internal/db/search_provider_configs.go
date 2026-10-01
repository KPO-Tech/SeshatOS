package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

type gSearchProviderConfig struct {
	ID              string `gorm:"primaryKey;size:64"`
	UserID          string `gorm:"column:user_id;size:64;not null;uniqueIndex:uq_user_provider"`
	Provider        string `gorm:"column:provider;size:64;not null;uniqueIndex:uq_user_provider"`
	Enabled         bool   `gorm:"column:enabled;not null;default:false"`
	APIKeyEncrypted string `gorm:"column:api_key_encrypted;not null;default:''"`
	BaseURL         string `gorm:"column:base_url;type:text;not null;default:''"`
	AuthUsername    string `gorm:"column:auth_username;type:text;not null;default:''"`
	UpdatedAtUnix   int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix   int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gSearchProviderConfig) TableName() string { return "search_provider_configs" }

type SearchProviderConfig struct {
	ID           string
	UserID       string
	Provider     string
	Enabled      bool
	HasAPIKey    bool
	BaseURL      string
	AuthUsername string
	UpdatedAt    time.Time
	CreatedAt    time.Time
}

type UpsertSearchProviderConfigParams struct {
	UserID       string
	Provider     string
	Enabled      bool
	APIKey       *string // nil = keep existing; ptr-to-"" = clear (used as Basic Auth password for SearXNG)
	BaseURL      string
	AuthUsername *string // nil = keep existing; ptr-to-"" = clear
}

type SearchProviderConfigStore struct {
	db *DB
}

func NewSearchProviderConfigStore(database *DB) (*SearchProviderConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("search provider config store: database is required")
	}
	return &SearchProviderConfigStore{db: database}, nil
}

func (s *SearchProviderConfigStore) ListByUserID(ctx context.Context, userID string) ([]SearchProviderConfig, error) {
	var rows []gSearchProviderConfig
	if err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("provider ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]SearchProviderConfig, 0, len(rows))
	for _, row := range rows {
		result = append(result, searchProviderConfigFromModel(row))
	}
	return result, nil
}

func (s *SearchProviderConfigStore) GetByUserAndProvider(ctx context.Context, userID, provider string) (*SearchProviderConfig, error) {
	var row gSearchProviderConfig
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ? AND provider = ?", userID, strings.ToLower(strings.TrimSpace(provider))).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("search provider config not found")
	}
	if err != nil {
		return nil, err
	}
	cfg := searchProviderConfigFromModel(row)
	return &cfg, nil
}

func (s *SearchProviderConfigStore) Upsert(ctx context.Context, p UpsertSearchProviderConfigParams) (*SearchProviderConfig, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	provider := strings.ToLower(strings.TrimSpace(p.Provider))
	if provider == "" {
		return nil, fmt.Errorf("provider is required")
	}

	var encrypted string
	if p.APIKey != nil {
		if *p.APIKey != "" {
			key, err := loadOrCreateEncryptionKey()
			if err != nil {
				return nil, fmt.Errorf("encryption key: %w", err)
			}
			enc, err := encryptAESGCM(key, []byte(*p.APIKey))
			if err != nil {
				return nil, fmt.Errorf("encrypt api key: %w", err)
			}
			encrypted = enc
		}
	}

	var row gSearchProviderConfig
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ? AND provider = ?", p.UserID, provider).
		First(&row).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		authUsername := ""
		if p.AuthUsername != nil {
			authUsername = strings.TrimSpace(*p.AuthUsername)
		}
		row = gSearchProviderConfig{
			ID:              newIdentityID("spc"),
			UserID:          p.UserID,
			Provider:        provider,
			Enabled:         p.Enabled,
			APIKeyEncrypted: encrypted,
			BaseURL:         strings.TrimSpace(p.BaseURL),
			AuthUsername:    authUsername,
		}
		if p.APIKey == nil {
			row.APIKeyEncrypted = ""
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		cfg := searchProviderConfigFromModel(row)
		return &cfg, nil
	}
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"enabled":  p.Enabled,
		"base_url": strings.TrimSpace(p.BaseURL),
	}
	if p.APIKey != nil {
		updates["api_key_encrypted"] = encrypted
	}
	if p.AuthUsername != nil {
		updates["auth_username"] = strings.TrimSpace(*p.AuthUsername)
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gSearchProviderConfig{}).
		Where("id = ?", row.ID).
		Updates(updates).Error; err != nil {
		return nil, err
	}

	cfg, err := s.GetByUserAndProvider(ctx, p.UserID, provider)
	if err != nil {
		return nil, err
	}
	return cfg, nil
}

func (s *SearchProviderConfigStore) Delete(ctx context.Context, userID, provider string) error {
	provider = strings.ToLower(strings.TrimSpace(provider))
	return s.db.gormDB.WithContext(ctx).
		Delete(&gSearchProviderConfig{}, "user_id = ? AND provider = ?", userID, provider).Error
}

func (s *SearchProviderConfigStore) GetDecryptedAPIKey(ctx context.Context, userID, provider string) (string, error) {
	var row gSearchProviderConfig
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ? AND provider = ?", userID, strings.ToLower(strings.TrimSpace(provider))).
		First(&row).Error
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

func searchProviderConfigFromModel(row gSearchProviderConfig) SearchProviderConfig {
	return SearchProviderConfig{
		ID:           row.ID,
		UserID:       row.UserID,
		Provider:     row.Provider,
		Enabled:      row.Enabled,
		HasAPIKey:    row.APIKeyEncrypted != "",
		BaseURL:      row.BaseURL,
		AuthUsername: row.AuthUsername,
		UpdatedAt:    time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt:    time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
}
