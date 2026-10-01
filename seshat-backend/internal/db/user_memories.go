package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	MemoryTypePreference  = "preference"
	MemoryTypeInstruction = "instruction"
	MemoryTypePattern     = "pattern"
	MemoryTypeFact        = "fact"
	MemoryTypeContext     = "context"
)

type gUserMemory struct {
	ID            string  `gorm:"primaryKey;size:64"`
	UserID        string  `gorm:"column:user_id;size:64;not null;index"`
	Type          string  `gorm:"column:type;size:64;not null;default:'fact'"`
	Key           string  `gorm:"column:key;type:text;not null;default:''"`
	Value         string  `gorm:"column:value;type:text;not null;default:''"`
	Importance    float64 `gorm:"column:importance;not null;default:0.5"`
	Source        string  `gorm:"column:source;size:255;not null;default:''"`
	CreatedAtUnix int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gUserMemory) TableName() string { return "user_memories" }

type UserMemory struct {
	ID         string
	UserID     string
	Type       string
	Key        string
	Value      string
	Importance float64
	Source     string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type CreateUserMemoryParams struct {
	UserID     string
	Type       string
	Key        string
	Value      string
	Importance float64
	Source     string
}

type UpdateUserMemoryParams struct {
	Type       *string
	Key        *string
	Value      *string
	Importance *float64
	Source     *string
}

type UserMemoryStore struct {
	db *DB
}

func NewUserMemoryStore(database *DB) (*UserMemoryStore, error) {
	if database == nil {
		return nil, fmt.Errorf("user memory store: database is required")
	}
	return &UserMemoryStore{db: database}, nil
}

func (s *UserMemoryStore) List(ctx context.Context, userID string) ([]UserMemory, error) {
	var rows []gUserMemory
	if err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("importance DESC, created_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]UserMemory, 0, len(rows))
	for _, r := range rows {
		result = append(result, userMemoryFromModel(r))
	}
	return result, nil
}

func (s *UserMemoryStore) Create(ctx context.Context, p CreateUserMemoryParams) (*UserMemory, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(p.Key) == "" {
		return nil, fmt.Errorf("key is required")
	}
	row := gUserMemory{
		ID:         newIdentityID("mem"),
		UserID:     strings.TrimSpace(p.UserID),
		Type:       normalizeMemoryType(p.Type),
		Key:        strings.TrimSpace(p.Key),
		Value:      strings.TrimSpace(p.Value),
		Importance: normalizeMemoryImportance(p.Importance),
		Source:     strings.TrimSpace(p.Source),
	}
	if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	m := userMemoryFromModel(row)
	return &m, nil
}

func (s *UserMemoryStore) Update(ctx context.Context, userID, id string, p UpdateUserMemoryParams) (*UserMemory, error) {
	current, err := s.GetByID(ctx, userID, id)
	if err != nil {
		return nil, err
	}

	row := gUserMemory{
		ID:            current.ID,
		UserID:        current.UserID,
		Type:          current.Type,
		Key:           current.Key,
		Value:         current.Value,
		Importance:    current.Importance,
		Source:        current.Source,
		CreatedAtUnix: current.CreatedAt.Unix(),
		UpdatedAtUnix: current.UpdatedAt.Unix(),
	}

	if p.Type != nil {
		row.Type = normalizeMemoryType(*p.Type)
	}
	if p.Key != nil {
		row.Key = strings.TrimSpace(*p.Key)
	}
	if p.Value != nil {
		row.Value = strings.TrimSpace(*p.Value)
	}
	if p.Importance != nil {
		row.Importance = normalizeMemoryImportance(*p.Importance)
	}
	if p.Source != nil {
		row.Source = strings.TrimSpace(*p.Source)
	}
	if row.Key == "" {
		return nil, fmt.Errorf("key is required")
	}

	res := s.db.gormDB.WithContext(ctx).
		Model(&gUserMemory{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]any{
			"type":            row.Type,
			"key":             row.Key,
			"value":           row.Value,
			"importance":      row.Importance,
			"source":          row.Source,
			"updated_at_unix": time.Now().Unix(),
		})
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return nil, fmt.Errorf("memory not found")
	}
	return s.GetByID(ctx, userID, id)
}

func (s *UserMemoryStore) Delete(ctx context.Context, userID, id string) error {
	res := s.db.gormDB.WithContext(ctx).
		Delete(&gUserMemory{}, "id = ? AND user_id = ?", id, userID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("memory not found")
	}
	return nil
}

func (s *UserMemoryStore) DeleteAll(ctx context.Context, userID string) (int64, error) {
	res := s.db.gormDB.WithContext(ctx).
		Delete(&gUserMemory{}, "user_id = ?", userID)
	return res.RowsAffected, res.Error
}

func (s *UserMemoryStore) Count(ctx context.Context, userID string) (int64, error) {
	var count int64
	err := s.db.gormDB.WithContext(ctx).
		Model(&gUserMemory{}).
		Where("user_id = ?", userID).
		Count(&count).Error
	return count, err
}

func (s *UserMemoryStore) GetByID(ctx context.Context, userID, id string) (*UserMemory, error) {
	var row gUserMemory
	err := s.db.gormDB.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("memory not found")
	}
	if err != nil {
		return nil, err
	}
	m := userMemoryFromModel(row)
	return &m, nil
}

func userMemoryFromModel(r gUserMemory) UserMemory {
	return UserMemory{
		ID:         r.ID,
		UserID:     r.UserID,
		Type:       r.Type,
		Key:        r.Key,
		Value:      r.Value,
		Importance: r.Importance,
		Source:     r.Source,
		CreatedAt:  time.Unix(r.CreatedAtUnix, 0).UTC(),
		UpdatedAt:  time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}
}

func normalizeMemoryType(value string) string {
	memType := strings.TrimSpace(value)
	if memType == "" {
		return MemoryTypeFact
	}
	return memType
}

func normalizeMemoryImportance(value float64) float64 {
	if value <= 0 {
		return 0.5
	}
	if value > 1 {
		return 1
	}
	return value
}
