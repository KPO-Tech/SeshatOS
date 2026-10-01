package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// ─── GORM model ───────────────────────────────────────────────────────────────

type gProviderModel struct {
	ID                string `gorm:"primaryKey;size:64"`
	ProviderSettingID string `gorm:"column:provider_setting_id;size:64;not null;index"`
	ModelID           string `gorm:"column:model_id;not null;size:255"`
	DisplayName       string `gorm:"column:display_name;not null;size:255;default:''"`
	ContextWindow     int    `gorm:"column:context_window;not null;default:0"`
	MaxOutput         int    `gorm:"column:max_output;not null;default:0"`
	IsDefault         bool   `gorm:"column:is_default;not null;default:false"`
	SortOrder         int    `gorm:"column:sort_order;not null;default:0"`
	// "catalog" = auto-seeded from registry or provider API; "user" = manually added
	Source        string `gorm:"column:source;not null;size:32;default:'user'"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gProviderModel) TableName() string { return "provider_models" }

// ─── Public types ─────────────────────────────────────────────────────────────

var ErrProviderModelNotFound = errors.New("provider model not found")

type ProviderModel struct {
	ID                string
	ProviderSettingID string
	ModelID           string
	DisplayName       string
	ContextWindow     int
	MaxOutput         int
	IsDefault         bool
	SortOrder         int
	Source            string // "catalog" or "user"
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type CreateProviderModelParams struct {
	ProviderSettingID string
	ModelID           string
	DisplayName       string
	ContextWindow     int
	MaxOutput         int
	IsDefault         bool
	SortOrder         int
	Source            string // optional; defaults to "user"
}

type UpdateProviderModelParams struct {
	ModelID       *string
	DisplayName   *string
	ContextWindow *int
	MaxOutput     *int
	IsDefault     *bool
	SortOrder     *int
}

// ─── Store ────────────────────────────────────────────────────────────────────

type ProviderModelStore struct {
	db *DB
}

func NewProviderModelStore(database *DB) (*ProviderModelStore, error) {
	if database == nil {
		return nil, fmt.Errorf("provider model store: database is required")
	}
	return &ProviderModelStore{db: database}, nil
}

func (s *ProviderModelStore) Create(ctx context.Context, p CreateProviderModelParams) (*ProviderModel, error) {
	if strings.TrimSpace(p.ProviderSettingID) == "" {
		return nil, fmt.Errorf("provider_setting_id is required")
	}
	if strings.TrimSpace(p.ModelID) == "" {
		return nil, fmt.Errorf("model_id is required")
	}
	displayName := strings.TrimSpace(p.DisplayName)
	if displayName == "" {
		displayName = strings.TrimSpace(p.ModelID)
	}
	source := p.Source
	if source == "" {
		source = "user"
	}
	row := gProviderModel{
		ID:                newIdentityID("pm"),
		ProviderSettingID: strings.TrimSpace(p.ProviderSettingID),
		ModelID:           strings.TrimSpace(p.ModelID),
		DisplayName:       displayName,
		ContextWindow:     p.ContextWindow,
		MaxOutput:         p.MaxOutput,
		IsDefault:         p.IsDefault,
		SortOrder:         p.SortOrder,
		Source:            source,
	}
	if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return providerModelFromRow(row), nil
}

func (s *ProviderModelStore) GetByID(ctx context.Context, id string) (*ProviderModel, error) {
	return s.getByScope(ctx, id, "")
}

func (s *ProviderModelStore) GetByIDForSetting(ctx context.Context, settingID, id string) (*ProviderModel, error) {
	return s.getByScope(ctx, id, settingID)
}

func (s *ProviderModelStore) getByScope(ctx context.Context, id string, settingID string) (*ProviderModel, error) {
	var row gProviderModel
	query := s.db.gormDB.WithContext(ctx).Where("id = ?", id)
	if strings.TrimSpace(settingID) != "" {
		query = query.Where("provider_setting_id = ?", settingID)
	}
	err := query.First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrProviderModelNotFound
	}
	if err != nil {
		return nil, err
	}
	return providerModelFromRow(row), nil
}

func (s *ProviderModelStore) ListBySettingID(ctx context.Context, settingID string) ([]ProviderModel, error) {
	var rows []gProviderModel
	if err := s.db.gormDB.WithContext(ctx).
		Where("provider_setting_id = ?", settingID).
		Order("sort_order ASC, created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]ProviderModel, 0, len(rows))
	for _, r := range rows {
		result = append(result, *providerModelFromRow(r))
	}
	return result, nil
}

func (s *ProviderModelStore) Update(ctx context.Context, id string, p UpdateProviderModelParams) (*ProviderModel, error) {
	return s.updateByScope(ctx, "", id, p)
}

func (s *ProviderModelStore) UpdateForSetting(ctx context.Context, settingID, id string, p UpdateProviderModelParams) (*ProviderModel, error) {
	return s.updateByScope(ctx, settingID, id, p)
}

func (s *ProviderModelStore) updateByScope(ctx context.Context, settingID, id string, p UpdateProviderModelParams) (*ProviderModel, error) {
	current, err := s.getByScope(ctx, id, settingID)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{}
	if p.ModelID != nil {
		updates["model_id"] = strings.TrimSpace(*p.ModelID)
	}
	if p.DisplayName != nil {
		updates["display_name"] = strings.TrimSpace(*p.DisplayName)
	}
	if p.ContextWindow != nil {
		updates["context_window"] = *p.ContextWindow
	}
	if p.MaxOutput != nil {
		updates["max_output"] = *p.MaxOutput
	}
	if p.IsDefault != nil {
		updates["is_default"] = *p.IsDefault
	}
	if p.SortOrder != nil {
		updates["sort_order"] = *p.SortOrder
	}
	if len(updates) == 0 {
		return current, nil
	}
	query := s.db.gormDB.WithContext(ctx).Model(&gProviderModel{}).Where("id = ?", id)
	if strings.TrimSpace(settingID) != "" {
		query = query.Where("provider_setting_id = ?", settingID)
	}
	if err := query.Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.getByScope(ctx, id, settingID)
}

func (s *ProviderModelStore) Delete(ctx context.Context, id string) error {
	return s.deleteByScope(ctx, "", id)
}

func (s *ProviderModelStore) DeleteForSetting(ctx context.Context, settingID, id string) error {
	return s.deleteByScope(ctx, settingID, id)
}

func (s *ProviderModelStore) deleteByScope(ctx context.Context, settingID, id string) error {
	query := s.db.gormDB.WithContext(ctx).Where("id = ?", id)
	if strings.TrimSpace(settingID) != "" {
		query = query.Where("provider_setting_id = ?", settingID)
	}
	result := query.Delete(&gProviderModel{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrProviderModelNotFound
	}
	return nil
}

func (s *ProviderModelStore) DeleteBySettingID(ctx context.Context, settingID string) error {
	return s.db.gormDB.WithContext(ctx).
		Delete(&gProviderModel{}, "provider_setting_id = ?", settingID).Error
}

// BulkReplaceCatalog replaces catalog-sourced models while preserving user-added ones (used by sync).
func (s *ProviderModelStore) BulkReplaceCatalog(ctx context.Context, settingID string, params []CreateProviderModelParams) ([]ProviderModel, error) {
	var catalogRows []ProviderModel
	err := s.db.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Delete only catalog models — user-added models survive sync
		if err := tx.Delete(&gProviderModel{}, "provider_setting_id = ? AND source != 'user'", settingID).Error; err != nil {
			return err
		}
		catalogRows = make([]ProviderModel, 0, len(params))
		for i, p := range params {
			displayName := strings.TrimSpace(p.DisplayName)
			if displayName == "" {
				displayName = strings.TrimSpace(p.ModelID)
			}
			row := gProviderModel{
				ID:                newIdentityID("pm"),
				ProviderSettingID: settingID,
				ModelID:           strings.TrimSpace(p.ModelID),
				DisplayName:       displayName,
				ContextWindow:     p.ContextWindow,
				MaxOutput:         p.MaxOutput,
				IsDefault:         p.IsDefault,
				SortOrder:         i,
				Source:            "catalog",
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
			catalogRows = append(catalogRows, *providerModelFromRow(row))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	// Return all models (catalog + preserved user models)
	return s.ListBySettingID(ctx, settingID)
}

// SeedCatalogModels inserts catalog models that don't already exist for a setting.
// Skips models that already have a row (by model_id), so it's safe to call on every provider creation.
func (s *ProviderModelStore) SeedCatalogModels(ctx context.Context, settingID string, params []CreateProviderModelParams) (int, error) {
	seeded := 0
	for i, p := range params {
		modelID := strings.TrimSpace(p.ModelID)
		if modelID == "" {
			continue
		}
		var existing gProviderModel
		err := s.db.gormDB.WithContext(ctx).
			Where("provider_setting_id = ? AND model_id = ?", settingID, modelID).
			First(&existing).Error
		if err == nil {
			continue // already seeded
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return seeded, err
		}
		displayName := strings.TrimSpace(p.DisplayName)
		if displayName == "" {
			displayName = modelID
		}
		row := gProviderModel{
			ID:                newIdentityID("pm"),
			ProviderSettingID: settingID,
			ModelID:           modelID,
			DisplayName:       displayName,
			ContextWindow:     p.ContextWindow,
			MaxOutput:         p.MaxOutput,
			IsDefault:         p.IsDefault && i == 0,
			SortOrder:         i,
			Source:            "catalog",
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return seeded, err
		}
		seeded++
	}
	return seeded, nil
}

// ─── Helper ───────────────────────────────────────────────────────────────────

func providerModelFromRow(r gProviderModel) *ProviderModel {
	source := r.Source
	if source == "" {
		source = "user"
	}
	return &ProviderModel{
		ID:                r.ID,
		ProviderSettingID: r.ProviderSettingID,
		ModelID:           r.ModelID,
		DisplayName:       r.DisplayName,
		ContextWindow:     r.ContextWindow,
		MaxOutput:         r.MaxOutput,
		IsDefault:         r.IsDefault,
		SortOrder:         r.SortOrder,
		Source:            source,
		CreatedAt:         time.Unix(r.CreatedAtUnix, 0).UTC(),
		UpdatedAt:         time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}
}
