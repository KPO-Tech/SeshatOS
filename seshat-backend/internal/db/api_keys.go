package db

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// ─── GORM model ───────────────────────────────────────────────────────────────

type gAPIKey struct {
	ID             string `gorm:"primaryKey;size:64"`
	UserID         string `gorm:"column:user_id;size:64;not null;index"`
	Name           string `gorm:"column:name;not null;default:''"`
	KeyHash        string `gorm:"column:key;uniqueIndex;size:128;not null"`
	KeySuffix      string `gorm:"column:key_suffix;size:16;not null;default:''"`
	ExpiresAtUnix  *int64 `gorm:"column:expires_at_unix"`
	LastUsedAtUnix *int64 `gorm:"column:last_used_at_unix"`
	CreatedAtUnix  int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix  int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gAPIKey) TableName() string { return "api_keys" }

// ─── Public types ─────────────────────────────────────────────────────────────

// APIKey is the public representation of an API key record.
type APIKey struct {
	ID     string
	UserID string
	Name   string
	// Key contains the plaintext key (sk-xxx) — only set at creation time.
	Key string
	// KeyMasked is the display-safe masked version (e.g. "sk-****abcd1234").
	KeyMasked  string
	ExpiresAt  *time.Time
	LastUsedAt *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// ─── Store ────────────────────────────────────────────────────────────────────

// APIKeyStore provides persistence operations for API keys.
type APIKeyStore struct {
	db *DB
}

func NewAPIKeyStore(database *DB) (*APIKeyStore, error) {
	if database == nil {
		return nil, fmt.Errorf("api key store: database is required")
	}
	return &APIKeyStore{db: database}, nil
}

// CreateAPIKey generates and persists a new API key for the given user.
// The returned APIKey.Key contains the full plaintext value — it is never stored or returned again.
func (s *APIKeyStore) CreateAPIKey(ctx context.Context, userID, name string, expiresAt *time.Time) (*APIKey, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	name = strings.TrimSpace(name)

	plainKey, err := generateAPIKey()
	if err != nil {
		return nil, fmt.Errorf("generate api key: %w", err)
	}

	now := time.Now().UTC()
	id := newIdentityID("apk")

	row := gAPIKey{
		ID:            id,
		UserID:        userID,
		Name:          name,
		KeyHash:       hashAPIKey(plainKey),
		KeySuffix:     apiKeySuffix(plainKey),
		CreatedAtUnix: now.Unix(),
		UpdatedAtUnix: now.Unix(),
	}
	if expiresAt != nil {
		unix := expiresAt.UTC().Unix()
		row.ExpiresAtUnix = &unix
	}

	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("insert api key: %w", err)
	}

	result := apiKeyFromRow(row)
	result.Key = plainKey // expose once at creation
	return result, nil
}

// GetUserByAPIKey looks up the user associated with the given plaintext API key.
// It also updates last_used_at asynchronously — callers may call TouchAPIKey for that.
func (s *APIKeyStore) GetUserByAPIKey(ctx context.Context, key string) (*User, error) {
	var row gAPIKey
	err := s.db.GormDB().WithContext(ctx).
		Where("\"key\" = ?", hashAPIKey(key)).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("api key not found")
		}
		return nil, fmt.Errorf("get api key: %w", err)
	}

	// Check expiry
	if row.ExpiresAtUnix != nil && time.Now().UTC().Unix() > *row.ExpiresAtUnix {
		return nil, fmt.Errorf("api key expired")
	}

	identityStore := &IdentityStore{db: s.db}
	return identityStore.GetUserByID(ctx, row.UserID)
}

// ListAPIKeysForUser returns all (non-revoked) API keys for a user with masked key values.
func (s *APIKeyStore) ListAPIKeysForUser(ctx context.Context, userID string) ([]APIKey, error) {
	var rows []gAPIKey
	if err := s.db.GormDB().WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list api keys: %w", err)
	}
	keys := make([]APIKey, 0, len(rows))
	for _, r := range rows {
		keys = append(keys, *apiKeyFromRow(r))
	}
	return keys, nil
}

// RevokeAPIKey deletes the API key identified by keyID, verifying it belongs to userID.
func (s *APIKeyStore) RevokeAPIKey(ctx context.Context, keyID, userID string) error {
	result := s.db.GormDB().WithContext(ctx).
		Where("id = ? AND user_id = ?", keyID, userID).
		Delete(&gAPIKey{})
	if result.Error != nil {
		return fmt.Errorf("revoke api key: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("api key not found")
	}
	return nil
}

func (s *APIKeyStore) RevokeAllForUser(ctx context.Context, userID string) error {
	if err := s.db.GormDB().WithContext(ctx).
		Where("user_id = ?", strings.TrimSpace(userID)).
		Delete(&gAPIKey{}).Error; err != nil {
		return fmt.Errorf("revoke api keys for user: %w", err)
	}
	return nil
}

// TouchAPIKey updates the last_used_at timestamp for the given API key ID.
func (s *APIKeyStore) TouchAPIKey(ctx context.Context, keyID string) error {
	now := time.Now().UTC().Unix()
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gAPIKey{}).Where("id = ?", keyID).
		Updates(map[string]any{
			"last_used_at_unix": now,
			"updated_at_unix":   now,
		}).Error; err != nil {
		return fmt.Errorf("touch api key: %w", err)
	}
	return nil
}

// GetAPIKeyByKey fetches the gAPIKey row for a given plaintext key (used internally for touch).
func (s *APIKeyStore) GetAPIKeyByKey(ctx context.Context, key string) (*gAPIKey, error) {
	var row gAPIKey
	err := s.db.GormDB().WithContext(ctx).
		Where("\"key\" = ?", hashAPIKey(key)).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("api key not found")
		}
		return nil, fmt.Errorf("get api key by key: %w", err)
	}
	return &row, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func generateAPIKey() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("generate api key random bytes: %w", err)
	}
	return "sk-" + hex.EncodeToString(raw[:]), nil
}

const apiKeyHashPrefix = "sha256:"

func hashAPIKey(key string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(key)))
	return apiKeyHashPrefix + hex.EncodeToString(sum[:])
}

func apiKeySuffix(key string) string {
	key = strings.TrimSpace(key)
	if len(key) <= 3 {
		return ""
	}
	if len(key) <= 11 {
		return key[3:]
	}
	return key[len(key)-8:]
}

func maskAPIKeySuffix(suffix string) string {
	if strings.TrimSpace(suffix) == "" {
		return "sk-****"
	}
	return "sk-****" + suffix
}

func apiKeyFromRow(r gAPIKey) *APIKey {
	suffix := r.KeySuffix
	if suffix == "" && strings.HasPrefix(r.KeyHash, "sk-") {
		suffix = apiKeySuffix(r.KeyHash)
	}
	k := &APIKey{
		ID:        r.ID,
		UserID:    r.UserID,
		Name:      r.Name,
		KeyMasked: maskAPIKeySuffix(suffix),
		CreatedAt: time.Unix(r.CreatedAtUnix, 0).UTC(),
		UpdatedAt: time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}
	if r.ExpiresAtUnix != nil {
		t := time.Unix(*r.ExpiresAtUnix, 0).UTC()
		k.ExpiresAt = &t
	}
	if r.LastUsedAtUnix != nil {
		t := time.Unix(*r.LastUsedAtUnix, 0).UTC()
		k.LastUsedAt = &t
	}
	return k
}
