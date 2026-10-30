package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// gRerankerModel is one rerank model the person has set up, to pick from. The one in use is copied into reranker_config, which is what
// the search reads.
type gRerankerModel struct {
	ID              string `gorm:"primaryKey;size:64"`
	BaseURL         string `gorm:"column:base_url;type:text;not null;default:''"`
	Model           string `gorm:"column:model;size:256;not null;default:''"`
	APIKeyEncrypted string `gorm:"column:api_key_encrypted;type:text;not null;default:''"`
	CreatedAtUnix   int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gRerankerModel) TableName() string { return "reranker_models" }

type RerankerModel struct {
	ID        string
	BaseURL   string
	Model     string
	HasAPIKey bool
	CreatedAt time.Time
}

func rerankerModelFromRow(row gRerankerModel) RerankerModel {
	return RerankerModel{ID: row.ID, BaseURL: row.BaseURL, Model: row.Model, HasAPIKey: row.APIKeyEncrypted != "", CreatedAt: time.Unix(row.CreatedAtUnix, 0).UTC()}
}

// ListModels returns the models set up, oldest first. The model already in use before the list existed is added to it the first time.
func (s *RerankerConfigStore) ListModels(ctx context.Context) ([]RerankerModel, error) {
	if err := s.adoptCurrent(ctx); err != nil {
		return nil, err
	}
	var rows []gRerankerModel
	if err := s.db.gormDB.WithContext(ctx).Order("created_at_unix, id").Find(&rows).Error; err != nil {
		return nil, err
	}
	models := make([]RerankerModel, 0, len(rows))
	for _, row := range rows {
		models = append(models, rerankerModelFromRow(row))
	}
	return models, nil
}

// AddModel sets up a model. The same endpoint and model set up again replaces the earlier one, key included when a new one is given.
func (s *RerankerConfigStore) AddModel(ctx context.Context, baseURL, model string, apiKey *string) (*RerankerModel, error) {
	baseURL, model = strings.TrimSpace(baseURL), strings.TrimSpace(model)
	if baseURL == "" {
		return nil, fmt.Errorf("a rerank model needs an endpoint")
	}
	var encrypted string
	if apiKey != nil && *apiKey != "" {
		aesKey, err := loadOrCreateEncryptionKey()
		if err != nil {
			return nil, fmt.Errorf("encryption key: %w", err)
		}
		if encrypted, err = encryptAESGCM(aesKey, []byte(*apiKey)); err != nil {
			return nil, fmt.Errorf("encrypt api key: %w", err)
		}
	}
	var row gRerankerModel
	err := s.db.gormDB.WithContext(ctx).Where("base_url = ? AND model = ?", baseURL, model).First(&row).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		row = gRerankerModel{ID: newIdentityID("rrk"), BaseURL: baseURL, Model: model, APIKeyEncrypted: encrypted}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	case apiKey != nil:
		row.APIKeyEncrypted = encrypted
		if err := s.db.gormDB.WithContext(ctx).Model(&gRerankerModel{}).Where("id = ?", row.ID).Update("api_key_encrypted", encrypted).Error; err != nil {
			return nil, err
		}
	}
	added := rerankerModelFromRow(row)
	return &added, nil
}

// RemoveModel forgets a model. It reports whether there was one.
func (s *RerankerConfigStore) RemoveModel(ctx context.Context, id string) (bool, error) {
	result := s.db.gormDB.WithContext(ctx).Where("id = ?", id).Delete(&gRerankerModel{})
	return result.RowsAffected > 0, result.Error
}

// UseModel makes a model the one the search uses and turns reranking on. It returns the configuration now in force, or nil when the
// model is not in the list.
func (s *RerankerConfigStore) UseModel(ctx context.Context, id string) (*RerankerConfig, error) {
	var row gRerankerModel
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", id).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	// The key goes over as it is stored: encrypted with the same key on both sides, so it needs no round trip.
	update := gRerankerConfig{ID: rerankerConfigID, BaseURL: row.BaseURL, Model: row.Model, APIKeyEncrypted: row.APIKeyEncrypted, Enabled: true}
	var current gRerankerConfig
	err = s.db.gormDB.WithContext(ctx).Where("id = ?", rerankerConfigID).First(&current).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		if err := s.db.gormDB.WithContext(ctx).Create(&update).Error; err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	default:
		if err := s.db.gormDB.WithContext(ctx).Model(&gRerankerConfig{}).Where("id = ?", rerankerConfigID).
			Updates(map[string]any{"base_url": row.BaseURL, "model": row.Model, "api_key_encrypted": row.APIKeyEncrypted, "enabled": true}).Error; err != nil {
			return nil, err
		}
	}
	return s.Get(ctx)
}

// adoptCurrent adds the configured model to the list when it is not there, so a model set up before the list existed shows in it.
func (s *RerankerConfigStore) adoptCurrent(ctx context.Context) error {
	var current gRerankerConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", rerankerConfigID).First(&current).Error
	if errors.Is(err, gorm.ErrRecordNotFound) || (err == nil && strings.TrimSpace(current.BaseURL) == "") {
		return nil
	}
	if err != nil {
		return err
	}
	var count int64
	if err := s.db.gormDB.WithContext(ctx).Model(&gRerankerModel{}).Where("base_url = ? AND model = ?", current.BaseURL, current.Model).Count(&count).Error; err != nil || count > 0 {
		return err
	}
	return s.db.gormDB.WithContext(ctx).Create(&gRerankerModel{ID: newIdentityID("rrk"), BaseURL: current.BaseURL, Model: current.Model, APIKeyEncrypted: current.APIKeyEncrypted}).Error
}
