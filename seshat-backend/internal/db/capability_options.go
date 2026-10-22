package db

import (
	"context"
	"fmt"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// gCapabilityOption is one named choice the person made for a capability beyond its provider: the image model, the voice of speech
// synthesis, and so on. Which names exist is decided in internal/settings (CapabilityOptionNames).
type gCapabilityOption struct {
	Capability    string `gorm:"primaryKey;size:32"`
	Name          string `gorm:"primaryKey;size:48"`
	Value         string `gorm:"type:text;not null;default:''"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gCapabilityOption) TableName() string { return "capability_options" }

// Options returns the choices saved for a capability, by name. A name that was never saved, or was cleared, is absent.
func (s *CapabilityLinkStore) Options(ctx context.Context, capability string) (map[string]string, error) {
	var rows []gCapabilityOption
	if err := s.db.gormDB.WithContext(ctx).Where("capability = ?", strings.ToLower(strings.TrimSpace(capability))).Find(&rows).Error; err != nil {
		return nil, err
	}
	options := make(map[string]string, len(rows))
	for _, row := range rows {
		options[row.Name] = row.Value
	}
	return options, nil
}

// SetOptions replaces the choices saved for a capability by the given ones; an empty value clears a name.
func (s *CapabilityLinkStore) SetOptions(ctx context.Context, capability string, options map[string]string) error {
	capability = strings.ToLower(strings.TrimSpace(capability))
	if capability == "" {
		return fmt.Errorf("capability is required")
	}
	return s.db.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("capability = ?", capability).Delete(&gCapabilityOption{}).Error; err != nil {
			return err
		}
		for name, value := range options {
			value = strings.TrimSpace(value)
			if value == "" {
				continue
			}
			row := gCapabilityOption{Capability: capability, Name: name, Value: value}
			if err := tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
