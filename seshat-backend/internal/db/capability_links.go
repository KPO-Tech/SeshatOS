package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// CapabilityLink records that a non-chat capability (image generation, audio,
// embeddings) should reuse the API key of an already-configured chat
// provider (provider_settings) instead of its own standalone credential.
// This is opt-in and explicit — created only when the user clicks "Use my
// <provider> key" in the UI, never inferred silently. Deleting the link (or
// deleting the referenced provider setting) falls back to whatever
// standalone credential the capability already had (an env var for
// image/audio, embedder_config's own key for embeddings).
type gCapabilityLink struct {
	Capability        string `gorm:"primaryKey;size:32"`
	ProviderSettingID string `gorm:"column:provider_setting_id;size:64;not null"`
	CreatedAtUnix     int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix     int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gCapabilityLink) TableName() string { return "capability_credential_links" }

type CapabilityLink struct {
	Capability        string
	ProviderSettingID string
	UpdatedAt         time.Time
}

type CapabilityLinkStore struct {
	db *DB
}

func NewCapabilityLinkStore(database *DB) (*CapabilityLinkStore, error) {
	if database == nil {
		return nil, fmt.Errorf("capability link store: database is required")
	}
	return &CapabilityLinkStore{db: database}, nil
}

// Get returns the linked provider setting ID for a capability, or
// ("", false, nil) if no link is configured.
func (s *CapabilityLinkStore) Get(ctx context.Context, capability string) (string, bool, error) {
	var row gCapabilityLink
	err := s.db.gormDB.WithContext(ctx).Where("capability = ?", strings.ToLower(strings.TrimSpace(capability))).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return row.ProviderSettingID, true, nil
}

// ListAll returns every configured link, keyed by capability.
func (s *CapabilityLinkStore) ListAll(ctx context.Context) (map[string]CapabilityLink, error) {
	var rows []gCapabilityLink
	if err := s.db.gormDB.WithContext(ctx).Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make(map[string]CapabilityLink, len(rows))
	for _, r := range rows {
		result[r.Capability] = CapabilityLink{
			Capability:        r.Capability,
			ProviderSettingID: r.ProviderSettingID,
			UpdatedAt:         time.Unix(r.UpdatedAtUnix, 0).UTC(),
		}
	}
	return result, nil
}

// Set upserts the link for a capability.
func (s *CapabilityLinkStore) Set(ctx context.Context, capability, providerSettingID string) error {
	capability = strings.ToLower(strings.TrimSpace(capability))
	providerSettingID = strings.TrimSpace(providerSettingID)
	if capability == "" {
		return fmt.Errorf("capability is required")
	}
	if providerSettingID == "" {
		return fmt.Errorf("provider_setting_id is required")
	}

	var existing gCapabilityLink
	err := s.db.gormDB.WithContext(ctx).Where("capability = ?", capability).First(&existing).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return s.db.gormDB.WithContext(ctx).Create(&gCapabilityLink{
			Capability:        capability,
			ProviderSettingID: providerSettingID,
		}).Error
	}
	if err != nil {
		return err
	}
	return s.db.gormDB.WithContext(ctx).
		Model(&gCapabilityLink{}).
		Where("capability = ?", capability).
		Update("provider_setting_id", providerSettingID).Error
}

// Delete removes the link for a capability, if any. Not an error if absent.
func (s *CapabilityLinkStore) Delete(ctx context.Context, capability string) error {
	return s.db.gormDB.WithContext(ctx).
		Where("capability = ?", strings.ToLower(strings.TrimSpace(capability))).
		Delete(&gCapabilityLink{}).Error
}

// DeleteByProviderSettingID removes any link pointing at a provider setting
// that's about to be deleted, so a stale link never points at nothing.
func (s *CapabilityLinkStore) DeleteByProviderSettingID(ctx context.Context, providerSettingID string) error {
	return s.db.gormDB.WithContext(ctx).
		Where("provider_setting_id = ?", providerSettingID).
		Delete(&gCapabilityLink{}).Error
}
