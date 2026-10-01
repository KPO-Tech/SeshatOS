package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

type gProviderOAuthConnection struct {
	SettingID                  string `gorm:"column:setting_id;primaryKey;size:64"`
	UserID                     string `gorm:"column:user_id;size:64;not null;index"`
	Provider                   string `gorm:"column:provider;size:64;not null"`
	Status                     string `gorm:"column:status;size:32;not null;default:'pending';index"`
	PendingDeviceCodeEncrypted string `gorm:"column:pending_device_code_encrypted;not null;default:''"`
	PendingUserCode            string `gorm:"column:pending_user_code;not null;default:''"`
	PendingVerificationURL     string `gorm:"column:pending_verification_url;not null;default:''"`
	PendingExpiresAtUnix       int64  `gorm:"column:pending_expires_at_unix;not null;default:0"`
	PendingIntervalSeconds     int    `gorm:"column:pending_interval_seconds;not null;default:0"`
	AccessTokenEncrypted       string `gorm:"column:access_token_encrypted;not null;default:''"`
	RefreshTokenEncrypted      string `gorm:"column:refresh_token_encrypted;not null;default:''"`
	IDTokenEncrypted           string `gorm:"column:id_token_encrypted;not null;default:''"`
	Scope                      string `gorm:"column:scope;not null;default:''"`
	Subject                    string `gorm:"column:subject;not null;default:''"`
	AccountEmail               string `gorm:"column:account_email;not null;default:''"`
	ExpiresAtUnix              int64  `gorm:"column:expires_at_unix;not null;default:0"`
	LastError                  string `gorm:"column:last_error;not null;default:''"`
	CreatedAtUnix              int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix              int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gProviderOAuthConnection) TableName() string { return "provider_oauth_connections" }

type ProviderOAuthConnection struct {
	SettingID              string
	UserID                 string
	Provider               string
	Status                 string
	PendingUserCode        string
	PendingVerificationURL string
	PendingExpiresAt       time.Time
	PendingIntervalSeconds int
	HasRefreshToken        bool
	Scope                  string
	Subject                string
	AccountEmail           string
	ExpiresAt              time.Time
	LastError              string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type ProviderOAuthSecret struct {
	AccessToken            string
	RefreshToken           string
	IDToken                string
	Scope                  string
	Subject                string
	AccountEmail           string
	ExpiresAt              time.Time
	PendingDeviceCode      string
	PendingUserCode        string
	PendingVerificationURL string
	PendingExpiresAt       time.Time
	PendingIntervalSeconds int
}

type UpsertProviderOAuthPendingParams struct {
	SettingID              string
	UserID                 string
	Provider               string
	Status                 string
	DeviceCode             string
	UserCode               string
	VerificationURL        string
	ExpiresAt              time.Time
	PendingIntervalSeconds int
	LastError              string
}

type UpdateProviderOAuthConnectedParams struct {
	SettingID        string
	Status           string
	AccessToken      string
	RefreshToken     string
	IDToken          string
	Scope            string
	Subject          string
	AccountEmail     string
	ExpiresAt        time.Time
	LastError        string
	ClearPendingFlow bool
}

type UpdateProviderOAuthStatusParams struct {
	SettingID  string
	Status     string
	LastError  string
	ClearToken bool
}

type ProviderOAuthConnectionStore struct {
	db *DB
}

func NewProviderOAuthConnectionStore(database *DB) (*ProviderOAuthConnectionStore, error) {
	if database == nil {
		return nil, fmt.Errorf("provider oauth connection store: database is required")
	}
	return &ProviderOAuthConnectionStore{db: database}, nil
}

func (s *ProviderOAuthConnectionStore) UpsertPending(ctx context.Context, p UpsertProviderOAuthPendingParams) (*ProviderOAuthConnection, error) {
	if strings.TrimSpace(p.SettingID) == "" {
		return nil, fmt.Errorf("setting_id is required")
	}
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(p.Provider) == "" {
		return nil, fmt.Errorf("provider is required")
	}
	deviceCodeEnc := ""
	if strings.TrimSpace(p.DeviceCode) != "" {
		key, err := loadOrCreateEncryptionKey()
		if err != nil {
			return nil, err
		}
		deviceCodeEnc, err = encryptAESGCM(key, []byte(p.DeviceCode))
		if err != nil {
			return nil, err
		}
	}
	row := gProviderOAuthConnection{
		SettingID:                  p.SettingID,
		UserID:                     p.UserID,
		Provider:                   strings.TrimSpace(p.Provider),
		Status:                     normalizeOAuthStatus(p.Status, "pending"),
		PendingDeviceCodeEncrypted: deviceCodeEnc,
		PendingUserCode:            strings.TrimSpace(p.UserCode),
		PendingVerificationURL:     strings.TrimSpace(p.VerificationURL),
		PendingExpiresAtUnix:       unixOrZero(p.ExpiresAt),
		PendingIntervalSeconds:     p.PendingIntervalSeconds,
		LastError:                  strings.TrimSpace(p.LastError),
	}
	if err := s.db.gormDB.WithContext(ctx).
		Where("setting_id = ?", p.SettingID).
		Assign(row).
		FirstOrCreate(&row).Error; err != nil {
		return nil, err
	}
	return providerOAuthConnectionFromModel(row), nil
}

func (s *ProviderOAuthConnectionStore) GetBySettingID(ctx context.Context, settingID string) (*ProviderOAuthConnection, error) {
	var row gProviderOAuthConnection
	err := s.db.gormDB.WithContext(ctx).Where("setting_id = ?", settingID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("provider oauth connection not found")
	}
	if err != nil {
		return nil, err
	}
	return providerOAuthConnectionFromModel(row), nil
}

func (s *ProviderOAuthConnectionStore) ListBySettingIDs(ctx context.Context, settingIDs []string) (map[string]ProviderOAuthConnection, error) {
	if len(settingIDs) == 0 {
		return map[string]ProviderOAuthConnection{}, nil
	}
	var rows []gProviderOAuthConnection
	if err := s.db.gormDB.WithContext(ctx).Where("setting_id IN ?", settingIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make(map[string]ProviderOAuthConnection, len(rows))
	for _, row := range rows {
		result[row.SettingID] = *providerOAuthConnectionFromModel(row)
	}
	return result, nil
}

func (s *ProviderOAuthConnectionStore) GetSecret(ctx context.Context, settingID string) (*ProviderOAuthSecret, error) {
	var row gProviderOAuthConnection
	if err := s.db.gormDB.WithContext(ctx).Where("setting_id = ?", settingID).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("provider oauth connection not found")
		}
		return nil, err
	}
	return providerOAuthSecretFromModel(row)
}

func (s *ProviderOAuthConnectionStore) UpdateConnected(ctx context.Context, p UpdateProviderOAuthConnectedParams) (*ProviderOAuthConnection, error) {
	var row gProviderOAuthConnection
	if err := s.db.gormDB.WithContext(ctx).Where("setting_id = ?", p.SettingID).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("provider oauth connection not found")
		}
		return nil, err
	}
	accessEnc, err := encryptOptionalSecret(p.AccessToken)
	if err != nil {
		return nil, err
	}
	refreshEnc, err := encryptOptionalSecret(p.RefreshToken)
	if err != nil {
		return nil, err
	}
	idEnc, err := encryptOptionalSecret(p.IDToken)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{
		"status":                  normalizeOAuthStatus(p.Status, "connected"),
		"access_token_encrypted":  accessEnc,
		"refresh_token_encrypted": refreshEnc,
		"id_token_encrypted":      idEnc,
		"scope":                   strings.TrimSpace(p.Scope),
		"subject":                 strings.TrimSpace(p.Subject),
		"account_email":           strings.TrimSpace(p.AccountEmail),
		"expires_at_unix":         unixOrZero(p.ExpiresAt),
		"last_error":              strings.TrimSpace(p.LastError),
	}
	if p.ClearPendingFlow {
		updates["pending_device_code_encrypted"] = ""
		updates["pending_user_code"] = ""
		updates["pending_verification_url"] = ""
		updates["pending_expires_at_unix"] = int64(0)
		updates["pending_interval_seconds"] = 0
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gProviderOAuthConnection{}).
		Where("setting_id = ?", p.SettingID).
		Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetBySettingID(ctx, p.SettingID)
}

func (s *ProviderOAuthConnectionStore) UpdateStatus(ctx context.Context, p UpdateProviderOAuthStatusParams) (*ProviderOAuthConnection, error) {
	updates := map[string]any{
		"status":     normalizeOAuthStatus(p.Status, "error"),
		"last_error": strings.TrimSpace(p.LastError),
	}
	if p.ClearToken {
		updates["access_token_encrypted"] = ""
		updates["refresh_token_encrypted"] = ""
		updates["id_token_encrypted"] = ""
		updates["scope"] = ""
		updates["subject"] = ""
		updates["account_email"] = ""
		updates["expires_at_unix"] = int64(0)
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gProviderOAuthConnection{}).
		Where("setting_id = ?", p.SettingID).
		Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetBySettingID(ctx, p.SettingID)
}

func (s *ProviderOAuthConnectionStore) DeleteBySettingID(ctx context.Context, settingID string) error {
	return s.db.gormDB.WithContext(ctx).Delete(&gProviderOAuthConnection{}, "setting_id = ?", settingID).Error
}

func encryptOptionalSecret(value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", nil
	}
	key, err := loadOrCreateEncryptionKey()
	if err != nil {
		return "", err
	}
	return encryptAESGCM(key, []byte(value))
}

func providerOAuthSecretFromModel(row gProviderOAuthConnection) (*ProviderOAuthSecret, error) {
	key, err := loadOrCreateEncryptionKey()
	if err != nil {
		return nil, err
	}
	accessToken, err := decryptOptionalSecret(key, row.AccessTokenEncrypted)
	if err != nil {
		return nil, err
	}
	refreshToken, err := decryptOptionalSecret(key, row.RefreshTokenEncrypted)
	if err != nil {
		return nil, err
	}
	idToken, err := decryptOptionalSecret(key, row.IDTokenEncrypted)
	if err != nil {
		return nil, err
	}
	pendingDeviceCode, err := decryptOptionalSecret(key, row.PendingDeviceCodeEncrypted)
	if err != nil {
		return nil, err
	}
	return &ProviderOAuthSecret{
		AccessToken:            accessToken,
		RefreshToken:           refreshToken,
		IDToken:                idToken,
		Scope:                  row.Scope,
		Subject:                row.Subject,
		AccountEmail:           row.AccountEmail,
		ExpiresAt:              timeOrZero(row.ExpiresAtUnix),
		PendingDeviceCode:      pendingDeviceCode,
		PendingUserCode:        row.PendingUserCode,
		PendingVerificationURL: row.PendingVerificationURL,
		PendingExpiresAt:       timeOrZero(row.PendingExpiresAtUnix),
		PendingIntervalSeconds: row.PendingIntervalSeconds,
	}, nil
}

func decryptOptionalSecret(key []byte, encoded string) (string, error) {
	if strings.TrimSpace(encoded) == "" {
		return "", nil
	}
	plain, err := decryptAESGCM(key, encoded)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func providerOAuthConnectionFromModel(row gProviderOAuthConnection) *ProviderOAuthConnection {
	return &ProviderOAuthConnection{
		SettingID:              row.SettingID,
		UserID:                 row.UserID,
		Provider:               row.Provider,
		Status:                 row.Status,
		PendingUserCode:        row.PendingUserCode,
		PendingVerificationURL: row.PendingVerificationURL,
		PendingExpiresAt:       timeOrZero(row.PendingExpiresAtUnix),
		PendingIntervalSeconds: row.PendingIntervalSeconds,
		HasRefreshToken:        row.RefreshTokenEncrypted != "",
		Scope:                  row.Scope,
		Subject:                row.Subject,
		AccountEmail:           row.AccountEmail,
		ExpiresAt:              timeOrZero(row.ExpiresAtUnix),
		LastError:              row.LastError,
		CreatedAt:              timeOrZero(row.CreatedAtUnix),
		UpdatedAt:              timeOrZero(row.UpdatedAtUnix),
	}
}

func normalizeOAuthStatus(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func unixOrZero(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UTC().Unix()
}

func timeOrZero(unix int64) time.Time {
	if unix <= 0 {
		return time.Time{}
	}
	return time.Unix(unix, 0).UTC()
}
