package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Kinds of knowledge source. A collection without a source belongs to the default one: what the person makes in the app and uploads.
const (
	KnowledgeSourceLocalFolder = "local_folder"
)

// KnowledgeSource is a place the collections of a person come from, other than the app itself: a folder of this computer for now.
// Adding one reads nothing; collections are made from it later.
type KnowledgeSource struct {
	ID     string
	UserID string
	Kind   string
	Name   string
	Root   string
	// Icon is the key of the icon the person chose for the source; empty for the kind's own.
	Icon      string
	CreatedAt time.Time
}

type gKnowledgeSource struct {
	ID            string `gorm:"primaryKey;size:64"`
	UserID        string `gorm:"column:user_id;size:64;not null;index"`
	Kind          string `gorm:"not null;size:32"`
	Name          string `gorm:"not null"`
	Root          string `gorm:"not null;default:''"`
	Icon          string `gorm:"not null;size:32;default:''"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gKnowledgeSource) TableName() string { return "knowledge_sources" }

func knowledgeSourceFromGorm(g gKnowledgeSource) KnowledgeSource {
	return KnowledgeSource{ID: g.ID, UserID: g.UserID, Kind: g.Kind, Name: g.Name, Root: g.Root, Icon: g.Icon, CreatedAt: time.Unix(g.CreatedAtUnix, 0).UTC()}
}

// ErrKnowledgeSourceNotFound is returned for a source that does not exist.
var ErrKnowledgeSourceNotFound = errors.New("knowledge source not found")

type CreateKnowledgeSourceParams struct {
	UserID string
	Kind   string
	Name   string
	Root   string
	Icon   string
}

func (s *CorpusStore) CreateSource(ctx context.Context, p CreateKnowledgeSourceParams) (*KnowledgeSource, error) {
	if strings.TrimSpace(p.UserID) == "" || strings.TrimSpace(p.Kind) == "" || strings.TrimSpace(p.Name) == "" {
		return nil, fmt.Errorf("user_id, kind and name are required")
	}
	row := gKnowledgeSource{ID: newIdentityID("src"), UserID: p.UserID, Kind: p.Kind, Name: p.Name, Root: p.Root, Icon: p.Icon, CreatedAtUnix: time.Now().UTC().Unix()}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create knowledge source: %w", err)
	}
	src := knowledgeSourceFromGorm(row)
	return &src, nil
}

func (s *CorpusStore) GetSource(ctx context.Context, id string) (*KnowledgeSource, error) {
	var row gKnowledgeSource
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrKnowledgeSourceNotFound
		}
		return nil, fmt.Errorf("get knowledge source: %w", err)
	}
	src := knowledgeSourceFromGorm(row)
	return &src, nil
}

func (s *CorpusStore) ListSources(ctx context.Context, userID string) ([]KnowledgeSource, error) {
	var rows []gKnowledgeSource
	if err := s.db.GormDB().WithContext(ctx).Where("user_id = ?", userID).Order("created_at_unix ASC, name ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list knowledge sources: %w", err)
	}
	out := make([]KnowledgeSource, 0, len(rows))
	for _, r := range rows {
		out = append(out, knowledgeSourceFromGorm(r))
	}
	return out, nil
}

// UpdateSource changes what is given: a nil field is left as it is.
func (s *CorpusStore) UpdateSource(ctx context.Context, id string, name, icon *string) error {
	updates := map[string]any{}
	if name != nil {
		updates["name"] = *name
	}
	if icon != nil {
		updates["icon"] = *icon
	}
	if len(updates) == 0 {
		return nil
	}
	return s.db.GormDB().WithContext(ctx).Model(&gKnowledgeSource{}).Where("id = ?", id).Updates(updates).Error
}

func (s *CorpusStore) DeleteSource(ctx context.Context, id string) error {
	return s.db.GormDB().WithContext(ctx).Delete(&gKnowledgeSource{}, "id = ?", id).Error
}

// CountBySource says how many active collections each source of a person holds; the default source is under "".
func (s *CorpusStore) CountBySource(ctx context.Context, userID string) (map[string]int, error) {
	var rows []struct {
		SourceID string
		N        int
	}
	if err := s.db.GormDB().WithContext(ctx).Model(&gCorpus{}).
		Select("source_id, count(*) as n").
		Where("user_id = ? AND status = ?", userID, CorpusStatusActive).
		Group("source_id").Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("count collections by source: %w", err)
	}
	out := map[string]int{}
	for _, r := range rows {
		out[r.SourceID] = r.N
	}
	return out, nil
}
