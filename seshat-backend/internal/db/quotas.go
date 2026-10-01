package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

type gUsageCounter struct {
	ID            string `gorm:"primaryKey;size:64"`
	UserID        string `gorm:"column:user_id;size:64;not null;uniqueIndex:idx_usage_counter_key"`
	Metric        string `gorm:"column:metric;size:64;not null;uniqueIndex:idx_usage_counter_key"`
	PeriodKey     string `gorm:"column:period_key;size:32;not null;uniqueIndex:idx_usage_counter_key"`
	Count         int64  `gorm:"column:count;not null;default:0"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gUsageCounter) TableName() string { return "usage_counters" }

type UsageCounter struct {
	ID        string
	UserID    string
	Metric    string
	PeriodKey string
	Count     int64
	CreatedAt time.Time
	UpdatedAt time.Time
}

func DayPeriodKey(t time.Time) string {
	return t.UTC().Format("2006-01-02")
}

func MonthPeriodKey(t time.Time) string {
	return t.UTC().Format("2006-01")
}

type UsageCounterStore struct {
	db *DB
}

func NewUsageCounterStore(database *DB) (*UsageCounterStore, error) {
	if database == nil {
		return nil, fmt.Errorf("usage counter store: database is required")
	}
	return &UsageCounterStore{db: database}, nil
}

// Increment adds delta to the counter for (userID, metric, periodKey). Creates the row if absent.
func (s *UsageCounterStore) Increment(ctx context.Context, userID, metric, periodKey string, delta int64) error {
	if strings.TrimSpace(userID) == "" {
		return fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(metric) == "" {
		return fmt.Errorf("metric is required")
	}
	if strings.TrimSpace(periodKey) == "" {
		return fmt.Errorf("period_key is required")
	}
	if delta <= 0 {
		delta = 1
	}

	// Try to update an existing row first — avoids a separate SELECT round trip.
	result := s.db.gormDB.WithContext(ctx).
		Model(&gUsageCounter{}).
		Where("user_id = ? AND metric = ? AND period_key = ?", userID, metric, periodKey).
		UpdateColumn("count", gorm.Expr("count + ?", delta))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		return nil
	}

	// Row does not exist yet; create it. Ignore unique constraint errors from races.
	err := s.db.gormDB.WithContext(ctx).Create(&gUsageCounter{
		ID:        newIdentityID("usg"),
		UserID:    userID,
		Metric:    metric,
		PeriodKey: periodKey,
		Count:     delta,
	}).Error
	if err != nil && isUniqueConstraintError(err) {
		// Another goroutine created the row concurrently; treat as success.
		return nil
	}
	return err
}

// Get returns the current count for (userID, metric, periodKey), or 0 if none.
func (s *UsageCounterStore) Get(ctx context.Context, userID, metric, periodKey string) (int64, error) {
	var row gUsageCounter
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ? AND metric = ? AND period_key = ?", userID, metric, periodKey).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return row.Count, nil
}

// ListByUser returns usage counters for a user, optionally filtered by metric.
func (s *UsageCounterStore) ListByUser(ctx context.Context, userID string, metric string, limit int) ([]UsageCounter, error) {
	if limit <= 0 || limit > 200 {
		limit = 60
	}
	q := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("period_key DESC, metric ASC").
		Limit(limit)
	if metric != "" {
		q = q.Where("metric = ?", metric)
	}
	var rows []gUsageCounter
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]UsageCounter, 0, len(rows))
	for _, row := range rows {
		result = append(result, UsageCounter{
			ID:        row.ID,
			UserID:    row.UserID,
			Metric:    row.Metric,
			PeriodKey: row.PeriodKey,
			Count:     row.Count,
			CreatedAt: time.Unix(row.CreatedAtUnix, 0).UTC(),
			UpdatedAt: time.Unix(row.UpdatedAtUnix, 0).UTC(),
		})
	}
	return result, nil
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")
}
