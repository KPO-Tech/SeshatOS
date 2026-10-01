package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// ─── GORM private model ───────────────────────────────────────────────────────

type gProviderSetting struct {
	ID              string `gorm:"primaryKey;size:64"`
	UserID          string `gorm:"column:user_id;size:64;not null;index"`
	Provider        string `gorm:"not null;size:64"`
	Name            string `gorm:"not null;size:255"`
	AuthKind        string `gorm:"column:auth_kind;not null;size:32;default:'api_key'"`
	BaseURL         string `gorm:"column:base_url;not null;default:''"`
	ModelID         string `gorm:"column:model_id;not null;default:''"`
	APIKeyEncrypted string `gorm:"column:api_key_encrypted;not null;default:''"`
	IsDefault       bool   `gorm:"column:is_default;not null;default:false"`
	CreatedAtUnix   int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix   int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gProviderSetting) TableName() string { return "provider_settings" }

// ─── Public types ─────────────────────────────────────────────────────────────

type ProviderSetting struct {
	ID        string
	UserID    string
	Provider  string
	Name      string
	AuthKind  string
	BaseURL   string
	ModelID   string
	HasAPIKey bool
	IsDefault bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type CreateProviderSettingParams struct {
	UserID   string
	Provider string
	Name     string
	AuthKind string
	BaseURL  string
	ModelID  string
	APIKey   string // plaintext, optional
}

type UpdateProviderSettingParams struct {
	Name     *string
	AuthKind *string
	BaseURL  *string
	ModelID  *string
	APIKey   *string // nil = keep existing; ptr-to-empty-string = clear
}

// ─── Store ────────────────────────────────────────────────────────────────────

type ProviderSettingStore struct {
	db *DB
}

func NewProviderSettingStore(database *DB) (*ProviderSettingStore, error) {
	if database == nil {
		return nil, fmt.Errorf("provider setting store: database is required")
	}
	return &ProviderSettingStore{db: database}, nil
}

func (s *ProviderSettingStore) Create(ctx context.Context, p CreateProviderSettingParams) (*ProviderSetting, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(p.Provider) == "" {
		return nil, fmt.Errorf("provider is required")
	}
	if strings.TrimSpace(p.Name) == "" {
		return nil, fmt.Errorf("name is required")
	}

	encrypted := ""
	if p.APIKey != "" {
		key, err := loadOrCreateEncryptionKey()
		if err != nil {
			return nil, err
		}
		encrypted, err = encryptAESGCM(key, []byte(p.APIKey))
		if err != nil {
			return nil, err
		}
	}

	row := gProviderSetting{
		ID:              newIdentityID("ps"),
		UserID:          p.UserID,
		Provider:        strings.TrimSpace(p.Provider),
		Name:            strings.TrimSpace(p.Name),
		AuthKind:        strings.TrimSpace(p.AuthKind),
		BaseURL:         strings.TrimSpace(p.BaseURL),
		ModelID:         strings.TrimSpace(p.ModelID),
		APIKeyEncrypted: encrypted,
	}
	if row.AuthKind == "" {
		row.AuthKind = "api_key"
	}
	if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return providerSettingFromModel(row), nil
}

func (s *ProviderSettingStore) GetByID(ctx context.Context, id string) (*ProviderSetting, error) {
	var row gProviderSetting
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", id).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("provider setting not found")
	}
	if err != nil {
		return nil, err
	}
	return providerSettingFromModel(row), nil
}

func (s *ProviderSettingStore) ListByUserID(ctx context.Context, userID string) ([]ProviderSetting, error) {
	var rows []gProviderSetting
	if err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]ProviderSetting, 0, len(rows))
	for _, r := range rows {
		result = append(result, *providerSettingFromModel(r))
	}
	return result, nil
}

func (s *ProviderSettingStore) ListAll(ctx context.Context) ([]ProviderSetting, error) {
	var rows []gProviderSetting
	if err := s.db.gormDB.WithContext(ctx).
		Order("user_id, created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]ProviderSetting, 0, len(rows))
	for _, r := range rows {
		result = append(result, *providerSettingFromModel(r))
	}
	return result, nil
}

func (s *ProviderSettingStore) Update(ctx context.Context, id string, p UpdateProviderSettingParams) (*ProviderSetting, error) {
	var row gProviderSetting
	if err := s.db.gormDB.WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("provider setting not found")
		}
		return nil, err
	}

	updates := map[string]any{}
	if p.Name != nil {
		updates["name"] = strings.TrimSpace(*p.Name)
	}
	if p.AuthKind != nil {
		updates["auth_kind"] = strings.TrimSpace(*p.AuthKind)
	}
	if p.BaseURL != nil {
		updates["base_url"] = strings.TrimSpace(*p.BaseURL)
	}
	if p.ModelID != nil {
		updates["model_id"] = strings.TrimSpace(*p.ModelID)
	}
	if p.APIKey != nil {
		if *p.APIKey == "" {
			updates["api_key_encrypted"] = ""
		} else {
			key, err := loadOrCreateEncryptionKey()
			if err != nil {
				return nil, err
			}
			enc, err := encryptAESGCM(key, []byte(*p.APIKey))
			if err != nil {
				return nil, err
			}
			updates["api_key_encrypted"] = enc
		}
	}

	if len(updates) == 0 {
		return providerSettingFromModel(row), nil
	}

	if err := s.db.gormDB.WithContext(ctx).
		Model(&gProviderSetting{}).
		Where("id = ?", id).
		Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetByID(ctx, id)
}

func (s *ProviderSettingStore) Delete(ctx context.Context, id string) error {
	return s.db.gormDB.WithContext(ctx).Delete(&gProviderSetting{}, "id = ?", id).Error
}

// GetDecryptedAPIKey returns the plaintext API key. Returns ("", nil) if none stored.
func (s *ProviderSettingStore) GetDecryptedAPIKey(ctx context.Context, id string) (string, error) {
	var row gProviderSetting
	if err := s.db.gormDB.WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", fmt.Errorf("provider setting not found")
		}
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

// ─── Helper ───────────────────────────────────────────────────────────────────

func providerSettingFromModel(r gProviderSetting) *ProviderSetting {
	return &ProviderSetting{
		ID:        r.ID,
		UserID:    r.UserID,
		Provider:  r.Provider,
		Name:      r.Name,
		AuthKind:  r.AuthKind,
		BaseURL:   r.BaseURL,
		ModelID:   r.ModelID,
		HasAPIKey: r.APIKeyEncrypted != "",
		IsDefault: r.IsDefault,
		CreatedAt: time.Unix(r.CreatedAtUnix, 0).UTC(),
		UpdatedAt: time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}
}

// GetDefaultByUserID returns the user's default provider setting.
// Returns (nil, nil) if the user has no default configured — not an error.
func (s *ProviderSettingStore) GetDefaultByUserID(ctx context.Context, userID string) (*ProviderSetting, error) {
	var row gProviderSetting
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ? AND is_default = ?", userID, true).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return providerSettingFromModel(row), nil
}

// SetDefault marks settingID as the default provider for userID, clearing all
// other defaults for that user in the same transaction.
func (s *ProviderSettingStore) SetDefault(ctx context.Context, userID, settingID string) error {
	return s.db.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&gProviderSetting{}).
			Where("user_id = ?", userID).
			Update("is_default", false).Error; err != nil {
			return err
		}
		return tx.Model(&gProviderSetting{}).
			Where("id = ? AND user_id = ?", settingID, userID).
			Update("is_default", true).Error
	})
}
