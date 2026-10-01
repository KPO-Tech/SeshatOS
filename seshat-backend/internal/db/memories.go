package db

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
)

// ─── GORM models ──────────────────────────────────────────────────────────────

type gMemoryEntity struct {
	ID            string `gorm:"primaryKey;size:64"`
	UserID        string `gorm:"column:user_id;size:64;not null;index"`
	Name          string `gorm:"column:name;type:text;not null"`
	EntityType    string `gorm:"column:entity_type;size:128;not null;default:'entity'"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gMemoryEntity) TableName() string { return "memory_entities" }

type gMemoryObservation struct {
	ID              string  `gorm:"primaryKey;size:64"`
	EntityID        string  `gorm:"column:entity_id;size:64;not null;index"`
	Content         string  `gorm:"column:content;type:text;not null"`
	SourceSessionID *string `gorm:"column:source_session_id;size:64"`
	CreatedAtUnix   int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gMemoryObservation) TableName() string { return "memory_observations" }

type gMemoryRelation struct {
	ID            string `gorm:"primaryKey;size:64"`
	UserID        string `gorm:"column:user_id;size:64;not null;index"`
	FromName      string `gorm:"column:from_name;size:256;not null"`
	ToName        string `gorm:"column:to_name;size:256;not null"`
	RelationType  string `gorm:"column:relation_type;size:128;not null"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gMemoryRelation) TableName() string { return "memory_relations" }

// ─── Store ────────────────────────────────────────────────────────────────────

// LongTermMemoryStore implements longterm.Store backed by the application DB.
type LongTermMemoryStore struct {
	db *DB
}

// NewLongTermMemoryStore creates a store backed by the given DB.
func NewLongTermMemoryStore(database *DB) (*LongTermMemoryStore, error) {
	if database == nil {
		return nil, fmt.Errorf("long-term memory store: database is required")
	}
	return &LongTermMemoryStore{db: database}, nil
}

// ─── UpsertEntities ──────────────────────────────────────────────────────────

func (s *LongTermMemoryStore) UpsertEntities(ctx context.Context, userID string, inputs []longterm.EntityInput) ([]longterm.Entity, error) {
	if userID == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if len(inputs) == 0 {
		return nil, nil
	}
	created := make([]longterm.Entity, 0)
	for _, inp := range inputs {
		name := strings.TrimSpace(inp.Name)
		if name == "" {
			continue
		}
		entityType := strings.TrimSpace(inp.EntityType)
		if entityType == "" {
			entityType = "entity"
		}

		// Check if entity already exists for this user.
		var existing gMemoryEntity
		err := s.db.gormDB.WithContext(ctx).
			Where("user_id = ? AND name = ?", userID, name).
			First(&existing).Error
		if err == nil {
			// Already exists — skip (reference implementation does not update).
			continue
		}
		if err != gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("check entity: %w", err)
		}

		row := gMemoryEntity{
			ID:         newIdentityID("ment"),
			UserID:     userID,
			Name:       name,
			EntityType: entityType,
		}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, fmt.Errorf("create entity %q: %w", name, err)
		}

		// Insert initial observations.
		entity := entityFromGorm(row, nil)
		if len(inp.Observations) > 0 {
			obs, err := s.insertObservations(ctx, row.ID, inp.Observations)
			if err != nil {
				return nil, err
			}
			entity.Observations = obs
		}
		created = append(created, entity)
	}
	return created, nil
}

// ─── AddObservations ─────────────────────────────────────────────────────────

func (s *LongTermMemoryStore) AddObservations(ctx context.Context, userID string, inputs []longterm.ObservationInput) ([]longterm.ObservationResult, error) {
	if userID == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	results := make([]longterm.ObservationResult, 0, len(inputs))
	for _, inp := range inputs {
		name := strings.TrimSpace(inp.EntityName)
		if name == "" {
			continue
		}
		var row gMemoryEntity
		if err := s.db.gormDB.WithContext(ctx).
			Where("user_id = ? AND name = ?", userID, name).
			First(&row).Error; err != nil {
			return nil, fmt.Errorf("entity %q not found: %w", name, err)
		}

		// Load existing observations for deduplication.
		existing, err := s.loadObservationContents(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		existingSet := make(map[string]bool, len(existing))
		for _, o := range existing {
			existingSet[o] = true
		}

		var toAdd []string
		for _, c := range inp.Contents {
			c = strings.TrimSpace(c)
			if c == "" || existingSet[c] {
				continue
			}
			toAdd = append(toAdd, c)
		}

		if len(toAdd) > 0 {
			if _, err := s.insertObservations(ctx, row.ID, toAdd); err != nil {
				return nil, err
			}
		}
		results = append(results, longterm.ObservationResult{
			EntityName:        name,
			AddedObservations: toAdd,
		})
	}
	return results, nil
}

// ─── SearchNodes ─────────────────────────────────────────────────────────────

func (s *LongTermMemoryStore) SearchNodes(ctx context.Context, userID, query string) (*longterm.Graph, error) {
	if userID == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	q := strings.ToLower(strings.TrimSpace(query))
	entities, err := s.loadEntitiesWithObservations(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Filter by name, type, or observation content (case-insensitive substring).
	matched := make([]longterm.Entity, 0)
	matchedIDs := make(map[string]bool)
	for _, e := range entities {
		if q == "" ||
			strings.Contains(strings.ToLower(e.Name), q) ||
			strings.Contains(strings.ToLower(e.EntityType), q) ||
			observationsContain(e.Observations, q) {
			matched = append(matched, e)
			matchedIDs[e.ID] = true
		}
	}

	relations, err := s.loadRelationsForEntities(ctx, userID, matchedIDs)
	if err != nil {
		return nil, err
	}
	return &longterm.Graph{Entities: matched, Relations: relations}, nil
}

// ─── OpenNodes ───────────────────────────────────────────────────────────────

func (s *LongTermMemoryStore) OpenNodes(ctx context.Context, userID string, names []string) (*longterm.Graph, error) {
	if userID == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if len(names) == 0 {
		return &longterm.Graph{}, nil
	}
	// Exact match on name.
	nameSet := make(map[string]bool, len(names))
	for _, n := range names {
		nameSet[strings.TrimSpace(n)] = true
	}

	entities, err := s.loadEntitiesWithObservations(ctx, userID)
	if err != nil {
		return nil, err
	}
	matched := make([]longterm.Entity, 0)
	matchedIDs := make(map[string]bool)
	for _, e := range entities {
		if nameSet[e.Name] {
			matched = append(matched, e)
			matchedIDs[e.ID] = true
		}
	}
	relations, err := s.loadRelationsForEntities(ctx, userID, matchedIDs)
	if err != nil {
		return nil, err
	}
	return &longterm.Graph{Entities: matched, Relations: relations}, nil
}

// ─── RetrieveForContext ───────────────────────────────────────────────────────

// RetrieveForContext searches nodes matching query, formats the result as a
// ## Memory Markdown block, and caps output at approximately maxTokens.
func (s *LongTermMemoryStore) RetrieveForContext(ctx context.Context, userID, query string, maxTokens int) (string, error) {
	if userID == "" || strings.TrimSpace(query) == "" {
		return "", nil
	}
	graph, err := s.SearchNodes(ctx, userID, query)
	if err != nil || graph == nil || len(graph.Entities) == 0 {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("## Memory\n\n")
	for _, e := range graph.Entities {
		sb.WriteString("**")
		sb.WriteString(e.Name)
		sb.WriteString("** (")
		sb.WriteString(e.EntityType)
		sb.WriteString(")\n")
		for _, o := range e.Observations {
			sb.WriteString("- ")
			sb.WriteString(o)
			sb.WriteString("\n")
		}
		sb.WriteString("\n")
	}
	if len(graph.Relations) > 0 {
		sb.WriteString("**Relations:**\n")
		for _, r := range graph.Relations {
			sb.WriteString("- ")
			sb.WriteString(r.From)
			sb.WriteString(" → ")
			sb.WriteString(r.To)
			sb.WriteString(" (")
			sb.WriteString(r.RelationType)
			sb.WriteString(")\n")
		}
	}

	result := sb.String()
	if maxTokens > 0 {
		result = truncateToTokens(result, maxTokens)
	}
	return strings.TrimRight(result, "\n"), nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (s *LongTermMemoryStore) insertObservations(ctx context.Context, entityID string, contents []string) ([]string, error) {
	rows := make([]gMemoryObservation, 0, len(contents))
	for _, c := range contents {
		rows = append(rows, gMemoryObservation{
			ID:       newIdentityID("mob"),
			EntityID: entityID,
			Content:  strings.TrimSpace(c),
		})
	}
	if err := s.db.gormDB.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&rows).Error; err != nil {
		return nil, fmt.Errorf("insert observations: %w", err)
	}
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Content
	}
	return out, nil
}

func (s *LongTermMemoryStore) loadObservationContents(ctx context.Context, entityID string) ([]string, error) {
	var rows []gMemoryObservation
	if err := s.db.gormDB.WithContext(ctx).
		Where("entity_id = ?", entityID).
		Order("created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("load observations: %w", err)
	}
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = r.Content
	}
	return out, nil
}

func (s *LongTermMemoryStore) loadEntitiesWithObservations(ctx context.Context, userID string) ([]longterm.Entity, error) {
	var entityRows []gMemoryEntity
	if err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at_unix ASC").
		Find(&entityRows).Error; err != nil {
		return nil, fmt.Errorf("load entities: %w", err)
	}
	if len(entityRows) == 0 {
		return nil, nil
	}

	// Batch-load all observations for these entities.
	ids := make([]string, len(entityRows))
	for i, r := range entityRows {
		ids[i] = r.ID
	}
	var obsRows []gMemoryObservation
	if err := s.db.gormDB.WithContext(ctx).
		Where("entity_id IN ?", ids).
		Order("created_at_unix ASC").
		Find(&obsRows).Error; err != nil {
		return nil, fmt.Errorf("load observations: %w", err)
	}

	// Group observations by entity ID.
	obsMap := make(map[string][]string, len(entityRows))
	for _, o := range obsRows {
		obsMap[o.EntityID] = append(obsMap[o.EntityID], o.Content)
	}

	out := make([]longterm.Entity, len(entityRows))
	for i, r := range entityRows {
		out[i] = entityFromGorm(r, obsMap[r.ID])
	}
	return out, nil
}

func (s *LongTermMemoryStore) loadRelationsForEntities(ctx context.Context, userID string, entityIDs map[string]bool) ([]longterm.Relation, error) {
	if len(entityIDs) == 0 {
		return nil, nil
	}
	ids := make([]string, 0, len(entityIDs))
	for id := range entityIDs {
		ids = append(ids, id)
	}

	var rows []gMemoryRelation
	if err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ? AND (from_name IN ? OR to_name IN ?)", userID, ids, ids).
		Order("created_at_unix ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("load relations: %w", err)
	}

	// Resolve entity IDs to names.
	allIDs := make(map[string]bool)
	for _, r := range rows {
		allIDs[r.FromName] = true
		allIDs[r.ToName] = true
	}
	nameByID, err := s.resolveEntityNames(ctx, allIDs)
	if err != nil {
		return nil, err
	}

	out := make([]longterm.Relation, 0, len(rows))
	for _, r := range rows {
		out = append(out, longterm.Relation{
			ID:           r.ID,
			UserID:       r.UserID,
			From:         nameByID[r.FromName],
			To:           nameByID[r.ToName],
			RelationType: r.RelationType,
			CreatedAt:    time.Unix(r.CreatedAtUnix, 0).UTC(),
		})
	}
	return out, nil
}

func (s *LongTermMemoryStore) resolveEntityNames(ctx context.Context, ids map[string]bool) (map[string]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	idSlice := make([]string, 0, len(ids))
	for id := range ids {
		idSlice = append(idSlice, id)
	}
	var rows []gMemoryEntity
	if err := s.db.gormDB.WithContext(ctx).
		Where("id IN ?", idSlice).
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("resolve entity names: %w", err)
	}
	m := make(map[string]string, len(rows))
	for _, r := range rows {
		m[r.ID] = r.Name
	}
	return m, nil
}

func entityFromGorm(r gMemoryEntity, observations []string) longterm.Entity {
	if observations == nil {
		observations = []string{}
	}
	return longterm.Entity{
		ID:           r.ID,
		UserID:       r.UserID,
		Name:         r.Name,
		EntityType:   r.EntityType,
		Observations: observations,
		CreatedAt:    time.Unix(r.CreatedAtUnix, 0).UTC(),
		UpdatedAt:    time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}
}

func observationsContain(observations []string, query string) bool {
	for _, o := range observations {
		if strings.Contains(strings.ToLower(o), query) {
			return true
		}
	}
	return false
}

// truncateToTokens caps s to approximately maxTokens (rough estimate: 4 chars = 1 token).
// Truncates at a newline boundary when possible.
func truncateToTokens(s string, maxTokens int) string {
	maxChars := maxTokens * 4
	if utf8.RuneCountInString(s) <= maxChars {
		return s
	}
	runes := []rune(s)
	cut := runes[:maxChars]
	// Walk back to the nearest newline.
	for i := len(cut) - 1; i >= 0; i-- {
		if cut[i] == '\n' {
			return string(cut[:i+1]) + "\n*(truncated)*"
		}
	}
	return string(cut) + "\n*(truncated)*"
}
