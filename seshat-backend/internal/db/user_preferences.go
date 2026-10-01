package db

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/KPO-Tech/seshat/pkg/types"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type gUserPreferences struct {
	UserID                    string `gorm:"primaryKey;column:user_id;size:64"`
	PreferredName             string `gorm:"column:preferred_name;size:255;not null;default:''"`
	Profession                string `gorm:"column:profession;size:255;not null;default:''"`
	About                     string `gorm:"column:about;type:text;not null;default:''"`
	WorkingStyle              string `gorm:"column:working_style;type:text;not null;default:''"`
	ResponseStyle             string `gorm:"column:response_style;type:text;not null;default:''"`
	ExtraContext              string `gorm:"column:extra_context;type:text;not null;default:''"`
	InteractivePermissionMode string `gorm:"column:interactive_permission_mode;size:64;not null;default:'onRequest'"`
	AutomationPermissionMode  string `gorm:"column:automation_permission_mode;size:64;not null;default:'never'"`
	// MaxSubAgentDepth: 0 = use server default (currently 3). UI exposes 1–5.
	MaxSubAgentDepth int   `gorm:"column:max_sub_agent_depth;not null;default:0"`
	UpdatedAtUnix    int64 `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gUserPreferences) TableName() string { return "user_preferences" }

type UserPreferences struct {
	UserID                    string
	PreferredName             string
	Profession                string
	About                     string
	WorkingStyle              string
	ResponseStyle             string
	ExtraContext              string
	InteractivePermissionMode string
	AutomationPermissionMode  string
	// MaxSubAgentDepth overrides the server default (3) when > 0. Range: 1–5.
	// 0 means "use server default". Set via Settings → Agent in the UI.
	MaxSubAgentDepth int
	UpdatedAt        time.Time
}

type UpsertUserPreferencesParams struct {
	UserID                    string
	PreferredName             string
	Profession                string
	About                     string
	WorkingStyle              string
	ResponseStyle             string
	ExtraContext              string
	InteractivePermissionMode string
	AutomationPermissionMode  string
	MaxSubAgentDepth          int
}

type UserPreferencesStore struct {
	db *DB
}

func NewUserPreferencesStore(database *DB) (*UserPreferencesStore, error) {
	if database == nil {
		return nil, fmt.Errorf("user preferences store: database is required")
	}
	return &UserPreferencesStore{db: database}, nil
}

func (s *UserPreferencesStore) Get(ctx context.Context, userID string) (*UserPreferences, error) {
	var row gUserPreferences
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ?", userID).
		First(&row).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p := userPreferencesFromModel(row)
	return &p, nil
}

func (s *UserPreferencesStore) Upsert(ctx context.Context, p UpsertUserPreferencesParams) (*UserPreferences, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	row := gUserPreferences{
		UserID:                    p.UserID,
		PreferredName:             strings.TrimSpace(p.PreferredName),
		Profession:                strings.TrimSpace(p.Profession),
		About:                     strings.TrimSpace(p.About),
		WorkingStyle:              strings.TrimSpace(p.WorkingStyle),
		ResponseStyle:             strings.TrimSpace(p.ResponseStyle),
		ExtraContext:              strings.TrimSpace(p.ExtraContext),
		InteractivePermissionMode: normalizeStoredPermissionMode(p.InteractivePermissionMode, types.PermissionModeOnRequest),
		AutomationPermissionMode:  normalizeStoredPermissionMode(p.AutomationPermissionMode, types.PermissionModeNever),
		MaxSubAgentDepth:          p.MaxSubAgentDepth,
	}
	err := s.db.gormDB.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"preferred_name", "profession", "about",
				"working_style", "response_style", "extra_context",
				"interactive_permission_mode", "automation_permission_mode",
				"max_sub_agent_depth", "updated_at_unix",
			}),
		}).
		Create(&row).Error
	if err != nil {
		return nil, err
	}
	// Re-fetch to get updated_at
	return s.Get(ctx, p.UserID)
}

func userPreferencesFromModel(r gUserPreferences) UserPreferences {
	return UserPreferences{
		UserID:                    r.UserID,
		PreferredName:             r.PreferredName,
		Profession:                r.Profession,
		About:                     r.About,
		WorkingStyle:              r.WorkingStyle,
		ResponseStyle:             r.ResponseStyle,
		ExtraContext:              r.ExtraContext,
		InteractivePermissionMode: normalizeStoredPermissionMode(r.InteractivePermissionMode, types.PermissionModeOnRequest),
		AutomationPermissionMode:  normalizeStoredPermissionMode(r.AutomationPermissionMode, types.PermissionModeNever),
		MaxSubAgentDepth:          r.MaxSubAgentDepth,
		UpdatedAt:                 time.Unix(r.UpdatedAtUnix, 0).UTC(),
	}
}

// BuildSystemPromptBlock renders the user preferences as a system prompt injection block.
// Returns empty string if there is nothing meaningful to inject.
func (p *UserPreferences) BuildSystemPromptBlock() string {
	if p == nil {
		return ""
	}
	var parts []string

	name := strings.TrimSpace(p.PreferredName)
	profession := strings.TrimSpace(p.Profession)
	about := strings.TrimSpace(p.About)
	workingStyle := strings.TrimSpace(p.WorkingStyle)
	responseStyle := strings.TrimSpace(p.ResponseStyle)
	extra := strings.TrimSpace(p.ExtraContext)

	if name == "" && profession == "" && about == "" && workingStyle == "" && responseStyle == "" && extra == "" {
		return ""
	}

	parts = append(parts, "## User Preferences")
	parts = append(parts, "")
	if name != "" {
		parts = append(parts, "The user's preferred name is: "+name+".")
	}
	if profession != "" {
		parts = append(parts, "Their profession/role: "+profession+".")
	}
	if about != "" {
		parts = append(parts, "About them: "+about)
	}
	if workingStyle != "" {
		parts = append(parts, "Their working style: "+workingStyle)
	}
	if responseStyle != "" {
		parts = append(parts, "How they prefer responses: "+responseStyle)
	}
	if extra != "" {
		parts = append(parts, "Additional context: "+extra)
	}

	return strings.Join(parts, "\n")
}

func normalizeStoredPermissionMode(raw string, fallback types.PermissionMode) string {
	return string(types.NormalizePermissionModeOrDefault(types.PermissionMode(strings.TrimSpace(raw)), fallback))
}

func (p *UserPreferences) PreferredInteractivePermissionMode() types.PermissionMode {
	if p == nil {
		return types.PermissionModeOnRequest
	}
	return types.NormalizePermissionModeOrDefault(types.PermissionMode(strings.TrimSpace(p.InteractivePermissionMode)), types.PermissionModeOnRequest)
}

func (p *UserPreferences) PreferredAutomationPermissionMode() types.PermissionMode {
	if p == nil {
		return types.PermissionModeNever
	}
	return types.NormalizePermissionModeOrDefault(types.PermissionMode(strings.TrimSpace(p.AutomationPermissionMode)), types.PermissionModeNever)
}
