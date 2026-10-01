package db

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

type gWebSearchSetting struct {
	ID                     string `gorm:"primaryKey;size:64"`
	UserID                 string `gorm:"column:user_id;size:64;not null;uniqueIndex"`
	Enabled                bool   `gorm:"column:enabled;not null;default:true"`
	ProviderSettingIDsJSON string `gorm:"column:provider_setting_ids_json;type:text;not null;default:'[]'"`
	AllowEnvFallback       bool   `gorm:"column:allow_env_fallback;not null;default:true"`
	AllowedDomainsJSON     string `gorm:"column:allowed_domains_json;type:text;not null;default:'[]'"`
	BlockedDomainsJSON     string `gorm:"column:blocked_domains_json;type:text;not null;default:'[]'"`
	MaxQueriesPerDay       int    `gorm:"column:max_queries_per_day;not null;default:0"`
	CreatedAtUnix          int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix          int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gWebSearchSetting) TableName() string { return "web_search_settings" }

type WebSearchSetting struct {
	ID                 string
	UserID             string
	Enabled            bool
	ProviderSettingIDs []string
	AllowEnvFallback   bool
	AllowedDomains     []string
	BlockedDomains     []string
	MaxQueriesPerDay   int
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type UpsertWebSearchSettingParams struct {
	UserID             string
	Enabled            bool
	ProviderSettingIDs []string
	AllowEnvFallback   bool
	AllowedDomains     []string
	BlockedDomains     []string
	MaxQueriesPerDay   int
}

type gWebSearchLog struct {
	ID                 string `gorm:"primaryKey;size:64"`
	UserID             string `gorm:"column:user_id;size:64;not null;index"`
	ProviderSettingID  string `gorm:"column:provider_setting_id;size:64;not null;default:'';index"`
	Provider           string `gorm:"column:provider;size:64;not null;default:'';index"`
	Query              string `gorm:"column:query;type:text;not null;default:''"`
	Status             string `gorm:"column:status;size:32;not null;index"`
	ErrorMessage       string `gorm:"column:error_message;type:text;not null;default:''"`
	AllowedDomainsJSON string `gorm:"column:allowed_domains_json;type:text;not null;default:'[]'"`
	BlockedDomainsJSON string `gorm:"column:blocked_domains_json;type:text;not null;default:'[]'"`
	ResultCount        int    `gorm:"column:result_count;not null;default:0"`
	DurationMillis     int64  `gorm:"column:duration_millis;not null;default:0"`
	CreatedAtUnix      int64  `gorm:"column:created_at_unix;autoCreateTime:unix;index"`
}

func (gWebSearchLog) TableName() string { return "web_search_logs" }

type WebSearchLog struct {
	ID                string
	UserID            string
	ProviderSettingID string
	Provider          string
	Query             string
	Status            string
	ErrorMessage      string
	AllowedDomains    []string
	BlockedDomains    []string
	ResultCount       int
	DurationMillis    int64
	CreatedAt         time.Time
}

type CreateWebSearchLogParams struct {
	UserID            string
	ProviderSettingID string
	Provider          string
	Query             string
	Status            string
	ErrorMessage      string
	AllowedDomains    []string
	BlockedDomains    []string
	ResultCount       int
	DurationMillis    int64
}

type WebSearchSettingStore struct {
	db *DB
}

func NewWebSearchSettingStore(database *DB) (*WebSearchSettingStore, error) {
	if database == nil {
		return nil, fmt.Errorf("web search setting store: database is required")
	}
	return &WebSearchSettingStore{db: database}, nil
}

func (s *WebSearchSettingStore) GetByUserID(ctx context.Context, userID string) (*WebSearchSetting, error) {
	var row gWebSearchSetting
	err := s.db.gormDB.WithContext(ctx).Where("user_id = ?", userID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("web search setting not found")
	}
	if err != nil {
		return nil, err
	}
	return webSearchSettingFromModel(row)
}

func (s *WebSearchSettingStore) Upsert(ctx context.Context, p UpsertWebSearchSettingParams) (*WebSearchSetting, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	providerSettingIDs, err := encodeStringSlice(p.ProviderSettingIDs)
	if err != nil {
		return nil, err
	}
	allowedDomains, err := encodeStringSlice(p.AllowedDomains)
	if err != nil {
		return nil, err
	}
	blockedDomains, err := encodeStringSlice(p.BlockedDomains)
	if err != nil {
		return nil, err
	}

	var row gWebSearchSetting
	err = s.db.gormDB.WithContext(ctx).Where("user_id = ?", p.UserID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = gWebSearchSetting{
			ID:                     newIdentityID("wss"),
			UserID:                 p.UserID,
			Enabled:                p.Enabled,
			ProviderSettingIDsJSON: providerSettingIDs,
			AllowEnvFallback:       p.AllowEnvFallback,
			AllowedDomainsJSON:     allowedDomains,
			BlockedDomainsJSON:     blockedDomains,
			MaxQueriesPerDay:       p.MaxQueriesPerDay,
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		return webSearchSettingFromModel(row)
	}
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"enabled":                   p.Enabled,
		"provider_setting_ids_json": providerSettingIDs,
		"allow_env_fallback":        p.AllowEnvFallback,
		"allowed_domains_json":      allowedDomains,
		"blocked_domains_json":      blockedDomains,
		"max_queries_per_day":       p.MaxQueriesPerDay,
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gWebSearchSetting{}).
		Where("id = ?", row.ID).
		Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetByUserID(ctx, p.UserID)
}

type WebSearchLogStore struct {
	db *DB
}

func NewWebSearchLogStore(database *DB) (*WebSearchLogStore, error) {
	if database == nil {
		return nil, fmt.Errorf("web search log store: database is required")
	}
	return &WebSearchLogStore{db: database}, nil
}

func (s *WebSearchLogStore) Create(ctx context.Context, p CreateWebSearchLogParams) (*WebSearchLog, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(p.Status) == "" {
		return nil, fmt.Errorf("status is required")
	}
	allowedDomains, err := encodeStringSlice(p.AllowedDomains)
	if err != nil {
		return nil, err
	}
	blockedDomains, err := encodeStringSlice(p.BlockedDomains)
	if err != nil {
		return nil, err
	}
	row := gWebSearchLog{
		ID:                 newIdentityID("wsl"),
		UserID:             p.UserID,
		ProviderSettingID:  strings.TrimSpace(p.ProviderSettingID),
		Provider:           strings.TrimSpace(p.Provider),
		Query:              strings.TrimSpace(p.Query),
		Status:             strings.TrimSpace(p.Status),
		ErrorMessage:       strings.TrimSpace(p.ErrorMessage),
		AllowedDomainsJSON: allowedDomains,
		BlockedDomainsJSON: blockedDomains,
		ResultCount:        p.ResultCount,
		DurationMillis:     p.DurationMillis,
	}
	if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return webSearchLogFromModel(row)
}

func (s *WebSearchLogStore) ListByUserID(ctx context.Context, userID string, limit int) ([]WebSearchLog, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows []gWebSearchLog
	if err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at_unix DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]WebSearchLog, 0, len(rows))
	for _, row := range rows {
		log, err := webSearchLogFromModel(row)
		if err != nil {
			return nil, err
		}
		result = append(result, *log)
	}
	return result, nil
}

func (s *WebSearchLogStore) CountByUserIDSince(ctx context.Context, userID string, since time.Time) (int64, error) {
	var count int64
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gWebSearchLog{}).
		Where("user_id = ? AND created_at_unix >= ? AND status <> ?", userID, since.Unix(), "quota_exceeded").
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func webSearchSettingFromModel(row gWebSearchSetting) (*WebSearchSetting, error) {
	providerSettingIDs, err := decodeStringSlice(row.ProviderSettingIDsJSON)
	if err != nil {
		return nil, err
	}
	allowedDomains, err := decodeStringSlice(row.AllowedDomainsJSON)
	if err != nil {
		return nil, err
	}
	blockedDomains, err := decodeStringSlice(row.BlockedDomainsJSON)
	if err != nil {
		return nil, err
	}
	return &WebSearchSetting{
		ID:                 row.ID,
		UserID:             row.UserID,
		Enabled:            row.Enabled,
		ProviderSettingIDs: providerSettingIDs,
		AllowEnvFallback:   row.AllowEnvFallback,
		AllowedDomains:     allowedDomains,
		BlockedDomains:     blockedDomains,
		MaxQueriesPerDay:   row.MaxQueriesPerDay,
		CreatedAt:          time.Unix(row.CreatedAtUnix, 0).UTC(),
		UpdatedAt:          time.Unix(row.UpdatedAtUnix, 0).UTC(),
	}, nil
}

func webSearchLogFromModel(row gWebSearchLog) (*WebSearchLog, error) {
	allowedDomains, err := decodeStringSlice(row.AllowedDomainsJSON)
	if err != nil {
		return nil, err
	}
	blockedDomains, err := decodeStringSlice(row.BlockedDomainsJSON)
	if err != nil {
		return nil, err
	}
	return &WebSearchLog{
		ID:                row.ID,
		UserID:            row.UserID,
		ProviderSettingID: row.ProviderSettingID,
		Provider:          row.Provider,
		Query:             row.Query,
		Status:            row.Status,
		ErrorMessage:      row.ErrorMessage,
		AllowedDomains:    allowedDomains,
		BlockedDomains:    blockedDomains,
		ResultCount:       row.ResultCount,
		DurationMillis:    row.DurationMillis,
		CreatedAt:         time.Unix(row.CreatedAtUnix, 0).UTC(),
	}, nil
}

func encodeStringSlice(values []string) (string, error) {
	raw, err := json.Marshal(normalizeStringSlice(values))
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func decodeStringSlice(raw string) ([]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var values []string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return nil, err
	}
	return normalizeStringSlice(values), nil
}

func normalizeStringSlice(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}
