package db

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type gAgentDefinition struct {
	ID             string `gorm:"primaryKey;size:64"`
	Slug           string `gorm:"column:slug;size:128;not null;uniqueIndex"`
	Name           string `gorm:"column:name;size:255;not null;default:''"`
	WhenToUse      string `gorm:"column:when_to_use;type:text;not null;default:''"`
	SystemPrompt   string `gorm:"column:system_prompt;type:text;not null;default:''"`
	Model          string `gorm:"column:model;size:255;not null;default:''"`
	ToolsJSON      string `gorm:"column:tools_json;type:text;not null;default:'[]'"`
	DisallowedJSON string `gorm:"column:disallowed_json;type:text;not null;default:'[]'"`
	MaxTurns       int    `gorm:"column:max_turns;not null;default:50"`
	PermissionMode string `gorm:"column:permission_mode;size:32;not null;default:''"`
	Isolation      string `gorm:"column:isolation;size:32;not null;default:''"`
	McpServersJSON string `gorm:"column:mcp_servers_json;type:text;not null;default:'[]'"`
	Icon           string `gorm:"column:icon;size:64;not null;default:'🤖'"`
	Enabled        bool   `gorm:"column:enabled;not null;default:true"`
	// Source distinguishes an agent created from inside an Automation
	// graph's own "agent" node ("workflow") from a normal Companion
	// persona ("user", the default for every row created before this
	// column existed and every caller that doesn't set it explicitly) -
	// see agents.Service.List, which excludes "workflow" rows.
	Source        string `gorm:"column:source;size:32;not null;default:'user'"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gAgentDefinition) TableName() string { return "agent_definitions" }

// AgentDefinition is the database representation of a user-defined agent.
type AgentDefinition struct {
	ID              string
	Slug            string
	Name            string
	WhenToUse       string
	SystemPrompt    string
	Model           string
	Tools           []string
	DisallowedTools []string
	MaxTurns        int
	PermissionMode  string
	Isolation       string
	McpServers      []string
	Icon            string
	Enabled         bool
	Source          string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type CreateAgentDefinitionParams struct {
	Slug            string
	Name            string
	WhenToUse       string
	SystemPrompt    string
	Model           string
	Tools           []string
	DisallowedTools []string
	MaxTurns        int
	PermissionMode  string
	Isolation       string
	McpServers      []string
	Icon            string
	Enabled         bool
	// Source defaults to "user" (empty string here means "not set" - the
	// store fills in the real default) - only the Automation "agent" node
	// passes "workflow" explicitly.
	Source string
}

type UpdateAgentDefinitionParams struct {
	Name            *string
	WhenToUse       *string
	SystemPrompt    *string
	Model           *string
	Tools           []string
	DisallowedTools []string
	MaxTurns        *int
	PermissionMode  *string
	Isolation       *string
	McpServers      []string
	Icon            *string
	Enabled         *bool
}

// AgentDefinitionStore persists user-defined agent definitions.
type AgentDefinitionStore struct {
	db *DB
}

func NewAgentDefinitionStore(db *DB) (*AgentDefinitionStore, error) {
	return &AgentDefinitionStore{db: db}, nil
}

func (s *AgentDefinitionStore) List(ctx context.Context) ([]AgentDefinition, error) {
	var rows []gAgentDefinition
	if err := s.db.gormDB.WithContext(ctx).Order("created_at_unix asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]AgentDefinition, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromGAgent(r))
	}
	return out, nil
}

func (s *AgentDefinitionStore) GetBySlug(ctx context.Context, slug string) (*AgentDefinition, error) {
	var row gAgentDefinition
	err := s.db.gormDB.WithContext(ctx).Where("slug = ?", slug).First(&row).Error
	if err != nil {
		return nil, err
	}
	a := fromGAgent(row)
	return &a, nil
}

func (s *AgentDefinitionStore) GetByID(ctx context.Context, id string) (*AgentDefinition, error) {
	var row gAgentDefinition
	if err := s.db.gormDB.WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		return nil, err
	}
	a := fromGAgent(row)
	return &a, nil
}

func (s *AgentDefinitionStore) Create(ctx context.Context, p CreateAgentDefinitionParams) (*AgentDefinition, error) {
	id := newIdentityID("agt")
	source := strings.TrimSpace(p.Source)
	if source == "" {
		source = "user"
	}
	row := gAgentDefinition{
		ID:             id,
		Slug:           strings.TrimSpace(p.Slug),
		Name:           strings.TrimSpace(p.Name),
		WhenToUse:      p.WhenToUse,
		SystemPrompt:   p.SystemPrompt,
		Model:          strings.TrimSpace(p.Model),
		ToolsJSON:      marshalStringSlice(p.Tools),
		DisallowedJSON: marshalStringSlice(p.DisallowedTools),
		MaxTurns:       p.MaxTurns,
		PermissionMode: strings.TrimSpace(p.PermissionMode),
		Isolation:      strings.TrimSpace(p.Isolation),
		McpServersJSON: marshalStringSlice(p.McpServers),
		Icon:           defaultAgentIcon(p.Icon),
		Enabled:        p.Enabled,
		Source:         source,
	}
	if err := s.db.gormDB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
		return nil, err
	}
	// Re-fetch so autoCreateTime/autoUpdateTime are populated.
	return s.GetByID(ctx, id)
}

func (s *AgentDefinitionStore) Update(ctx context.Context, id string, p UpdateAgentDefinitionParams) (*AgentDefinition, error) {
	updates := map[string]any{}
	if p.Name != nil {
		updates["name"] = strings.TrimSpace(*p.Name)
	}
	if p.WhenToUse != nil {
		updates["when_to_use"] = *p.WhenToUse
	}
	if p.SystemPrompt != nil {
		updates["system_prompt"] = *p.SystemPrompt
	}
	if p.Model != nil {
		updates["model"] = strings.TrimSpace(*p.Model)
	}
	if p.Tools != nil {
		updates["tools_json"] = marshalStringSlice(p.Tools)
	}
	if p.DisallowedTools != nil {
		updates["disallowed_json"] = marshalStringSlice(p.DisallowedTools)
	}
	if p.MaxTurns != nil {
		updates["max_turns"] = *p.MaxTurns
	}
	if p.PermissionMode != nil {
		updates["permission_mode"] = strings.TrimSpace(*p.PermissionMode)
	}
	if p.Isolation != nil {
		updates["isolation"] = strings.TrimSpace(*p.Isolation)
	}
	if p.McpServers != nil {
		updates["mcp_servers_json"] = marshalStringSlice(p.McpServers)
	}
	if p.Icon != nil {
		updates["icon"] = *p.Icon
	}
	if p.Enabled != nil {
		updates["enabled"] = *p.Enabled
	}
	if len(updates) == 0 {
		return s.GetByID(ctx, id)
	}
	if err := s.db.gormDB.WithContext(ctx).Model(&gAgentDefinition{}).
		Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetByID(ctx, id)
}

func (s *AgentDefinitionStore) Delete(ctx context.Context, id string) error {
	result := s.db.gormDB.WithContext(ctx).Where("id = ?", id).Delete(&gAgentDefinition{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func fromGAgent(r gAgentDefinition) AgentDefinition {
	return AgentDefinition{
		ID:              r.ID,
		Slug:            r.Slug,
		Name:            r.Name,
		WhenToUse:       r.WhenToUse,
		SystemPrompt:    r.SystemPrompt,
		Model:           r.Model,
		Tools:           unmarshalStringSlice(r.ToolsJSON),
		DisallowedTools: unmarshalStringSlice(r.DisallowedJSON),
		MaxTurns:        r.MaxTurns,
		PermissionMode:  r.PermissionMode,
		Isolation:       r.Isolation,
		McpServers:      unmarshalStringSlice(r.McpServersJSON),
		Icon:            r.Icon,
		Enabled:         r.Enabled,
		Source:          r.Source,
		CreatedAt:       time.Unix(r.CreatedAtUnix, 0),
		UpdatedAt:       time.Unix(r.UpdatedAtUnix, 0),
	}
}

func marshalStringSlice(v []string) string {
	if v == nil {
		return "[]"
	}
	b, _ := json.Marshal(v)
	return string(b)
}

func unmarshalStringSlice(raw string) []string {
	if strings.TrimSpace(raw) == "" || raw == "[]" {
		return nil
	}
	var out []string
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}

func defaultAgentIcon(icon string) string {
	if strings.TrimSpace(icon) == "" {
		return "🤖"
	}
	return icon
}
