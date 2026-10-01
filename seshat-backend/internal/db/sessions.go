package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/KPO-Tech/seshat/pkg/types"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SessionOwnership links a runtime session to a product-layer owner.
// The core runtime has no knowledge of this table.
type SessionOwnership struct {
	SessionID         string
	UserID            string
	ProviderSettingID string
	ModelID           string
	WorkspaceID       string // empty if not workspace-scoped
	OrganizationID    string // empty if not org-scoped
	Title             string
	PermissionMode    string
	ExecutionOrigin   string
	// Source identifies the feature that created this session ("" for a
	// normal chat session, "knowledge" for one created by the Knowledge
	// search page) - purely a UI hint so the sidebar's Recents list can
	// exclude one-off lookups without treating them differently in any
	// other way (they're still full sessions, reachable from History).
	Source string
	// ForcedExecutionMode is a host-set override ("plan"/"execute") applied
	// to the SDK session right before the next turn is submitted — see
	// query.Service's use of Session.ForcePlanMode()/ClearPlanMode(). Empty
	// means no override; the model's own enter_plan_mode/exit_plan_mode
	// calls remain the default source of truth.
	ForcedExecutionMode string
	WorkspacePath       string // session sandbox: ~/.config/seshat/workspaces/<session-id>/
	ProjectPath         string // user-chosen project directory (optional)
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type CreateSessionOwnershipParams struct {
	SessionID         string
	UserID            string
	ProviderSettingID string // optional
	ModelID           string // optional
	WorkspaceID       string // optional
	OrganizationID    string // optional
	Title             string // optional
	PermissionMode    string // optional
	ExecutionOrigin   string // optional; defaults to interactive
	Source            string // optional; "" for a normal chat session
	WorkspacePath     string // optional; session sandbox root
	ProjectPath       string // optional; user-chosen project directory
}

// ─── GORM private model ───────────────────────────────────────────────────────

type gSessionOwnership struct {
	SessionID           string  `gorm:"primaryKey;size:64;column:session_id"`
	UserID              string  `gorm:"column:user_id;size:64;not null;index"`
	ProviderSettingID   *string `gorm:"column:provider_setting_id;size:64;index"`
	ModelID             *string `gorm:"column:model_id;size:255;index"`
	WorkspaceID         *string `gorm:"column:workspace_id;size:64"`
	OrganizationID      *string `gorm:"column:organization_id;size:64"`
	Title               string  `gorm:"not null;default:''"`
	PermissionMode      *string `gorm:"column:permission_mode;size:64;index"`
	ExecutionOrigin     string  `gorm:"column:execution_origin;size:32;not null;default:'interactive'"`
	Source              string  `gorm:"column:source;size:32;not null;default:''"`
	ForcedExecutionMode *string `gorm:"column:forced_execution_mode;size:32"`
	WorkspacePath       *string `gorm:"column:workspace_path;size:1024"`
	ProjectPath         *string `gorm:"column:project_path;size:1024"`
	CreatedAtUnix       int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix       int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gSessionOwnership) TableName() string { return "session_ownership" }

func sessionOwnershipFromGorm(g gSessionOwnership) SessionOwnership {
	o := SessionOwnership{
		SessionID:       g.SessionID,
		UserID:          g.UserID,
		Title:           g.Title,
		ExecutionOrigin: string(types.NormalizeExecutionOrigin(g.ExecutionOrigin)),
		Source:          g.Source,
		CreatedAt:       time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt:       time.Unix(g.UpdatedAtUnix, 0).UTC(),
	}
	if g.ProviderSettingID != nil {
		o.ProviderSettingID = *g.ProviderSettingID
	}
	if g.PermissionMode != nil {
		o.PermissionMode = string(types.NormalizePermissionModeOrDefault(types.PermissionMode(strings.TrimSpace(*g.PermissionMode)), types.PermissionModeOnRequest))
	}
	if g.ModelID != nil {
		o.ModelID = *g.ModelID
	}
	if g.WorkspaceID != nil {
		o.WorkspaceID = *g.WorkspaceID
	}
	if g.OrganizationID != nil {
		o.OrganizationID = *g.OrganizationID
	}
	if g.WorkspacePath != nil {
		o.WorkspacePath = *g.WorkspacePath
	}
	if g.ProjectPath != nil {
		o.ProjectPath = *g.ProjectPath
	}
	if g.ForcedExecutionMode != nil {
		o.ForcedExecutionMode = *g.ForcedExecutionMode
	}
	return o
}

// ─── SessionOwnershipStore ────────────────────────────────────────────────────

type SessionOwnershipStore struct {
	db *DB
}

func NewSessionOwnershipStore(database *DB) (*SessionOwnershipStore, error) {
	if database == nil {
		return nil, fmt.Errorf("database is required")
	}
	return &SessionOwnershipStore{db: database}, nil
}

func (s *SessionOwnershipStore) Create(ctx context.Context, params CreateSessionOwnershipParams) (*SessionOwnership, error) {
	if strings.TrimSpace(params.SessionID) == "" {
		return nil, fmt.Errorf("session_id is required")
	}
	if strings.TrimSpace(params.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	now := time.Now().UTC()
	row := gSessionOwnership{
		SessionID:       params.SessionID,
		UserID:          params.UserID,
		Title:           params.Title,
		ExecutionOrigin: string(types.NormalizeExecutionOrigin(strings.TrimSpace(params.ExecutionOrigin))),
		Source:          strings.TrimSpace(params.Source),
		CreatedAtUnix:   now.Unix(),
		UpdatedAtUnix:   now.Unix(),
	}
	if params.ProviderSettingID != "" {
		row.ProviderSettingID = &params.ProviderSettingID
	}
	if params.ModelID != "" {
		row.ModelID = &params.ModelID
	}
	if params.WorkspaceID != "" {
		row.WorkspaceID = &params.WorkspaceID
	}
	if normalized, ok := types.NormalizePermissionMode(strings.TrimSpace(params.PermissionMode)); ok {
		mode := string(normalized)
		row.PermissionMode = &mode
	}
	if params.OrganizationID != "" {
		row.OrganizationID = &params.OrganizationID
	}
	if strings.TrimSpace(params.WorkspacePath) != "" {
		p := strings.TrimSpace(params.WorkspacePath)
		row.WorkspacePath = &p
	}
	if strings.TrimSpace(params.ProjectPath) != "" {
		p := strings.TrimSpace(params.ProjectPath)
		row.ProjectPath = &p
	}

	if err := s.db.GormDB().WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create session ownership: %w", err)
	}
	result := &SessionOwnership{
		SessionID:         params.SessionID,
		UserID:            params.UserID,
		ProviderSettingID: params.ProviderSettingID,
		ModelID:           params.ModelID,
		WorkspaceID:       params.WorkspaceID,
		OrganizationID:    params.OrganizationID,
		Title:             params.Title,
		PermissionMode:    string(types.NormalizePermissionModeOrDefault(types.PermissionMode(strings.TrimSpace(params.PermissionMode)), types.PermissionModeOnRequest)),
		ExecutionOrigin:   string(types.NormalizeExecutionOrigin(strings.TrimSpace(params.ExecutionOrigin))),
		Source:            strings.TrimSpace(params.Source),
		WorkspacePath:     strings.TrimSpace(params.WorkspacePath),
		ProjectPath:       strings.TrimSpace(params.ProjectPath),
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	return result, nil
}

func (s *SessionOwnershipStore) GetBySessionID(ctx context.Context, sessionID string) (*SessionOwnership, error) {
	var row gSessionOwnership
	err := s.db.GormDB().WithContext(ctx).
		Where("session_id = ?", sessionID).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("session ownership not found")
		}
		return nil, fmt.Errorf("get session ownership: %w", err)
	}
	result := sessionOwnershipFromGorm(row)
	return &result, nil
}

func (s *SessionOwnershipStore) ListByUserID(ctx context.Context, userID string) ([]SessionOwnership, error) {
	var rows []gSessionOwnership
	if err := s.db.GormDB().WithContext(ctx).
		Where("user_id = ?", userID).
		Order("updated_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list session ownership by user: %w", err)
	}
	results := make([]SessionOwnership, 0, len(rows))
	for _, r := range rows {
		results = append(results, sessionOwnershipFromGorm(r))
	}
	return results, nil
}

// SearchByTitle returns sessions whose title contains needle (case-insensitive LIKE).
// Results are ordered by updated_at DESC. limit <= 0 means no limit.
func (s *SessionOwnershipStore) SearchByTitle(ctx context.Context, userID, needle string, limit int) ([]SessionOwnership, error) {
	query := s.db.GormDB().WithContext(ctx).
		Where("user_id = ? AND LOWER(title) LIKE ?", userID, "%"+strings.ToLower(needle)+"%").
		Order("updated_at_unix DESC")
	if limit > 0 {
		query = query.Limit(limit)
	}
	var rows []gSessionOwnership
	if err := query.Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("search session ownership by title: %w", err)
	}
	results := make([]SessionOwnership, 0, len(rows))
	for _, r := range rows {
		results = append(results, sessionOwnershipFromGorm(r))
	}
	return results, nil
}

func (s *SessionOwnershipStore) ListAll(ctx context.Context) ([]SessionOwnership, error) {
	var rows []gSessionOwnership
	if err := s.db.GormDB().WithContext(ctx).
		Order("updated_at_unix DESC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list all session ownership: %w", err)
	}
	results := make([]SessionOwnership, 0, len(rows))
	for _, r := range rows {
		results = append(results, sessionOwnershipFromGorm(r))
	}
	return results, nil
}

func (s *SessionOwnershipStore) Delete(ctx context.Context, sessionID string) error {
	if err := s.db.GormDB().WithContext(ctx).
		Delete(&gSessionOwnership{}, "session_id = ?", sessionID).Error; err != nil {
		return fmt.Errorf("delete session ownership: %w", err)
	}
	return nil
}

func (s *SessionOwnershipStore) UpdateTitle(ctx context.Context, sessionID, title string) error {
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gSessionOwnership{}).Where("session_id = ?", sessionID).
		Updates(map[string]any{
			"title":           title,
			"updated_at_unix": time.Now().UTC().Unix(),
		}).Error; err != nil {
		return fmt.Errorf("update session title: %w", err)
	}
	return nil
}

func (s *SessionOwnershipStore) UpdateExecutionPolicy(ctx context.Context, sessionID, permissionMode, executionOrigin string) error {
	updates := map[string]any{
		"updated_at_unix":  time.Now().UTC().Unix(),
		"execution_origin": string(types.NormalizeExecutionOrigin(strings.TrimSpace(executionOrigin))),
	}
	if normalized, ok := types.NormalizePermissionMode(strings.TrimSpace(permissionMode)); ok {
		mode := string(normalized)
		updates["permission_mode"] = mode
	} else {
		updates["permission_mode"] = nil
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gSessionOwnership{}).Where("session_id = ?", sessionID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("update session execution policy: %w", err)
	}
	return nil
}

// UpdateForcedExecutionMode sets or clears the host-forced execution-mode
// override for a session. Pass "" to clear it (falls back to whatever the
// model itself decides via enter_plan_mode/exit_plan_mode).
func (s *SessionOwnershipStore) UpdateForcedExecutionMode(ctx context.Context, sessionID, mode string) error {
	trimmed := strings.TrimSpace(mode)
	updates := map[string]any{
		"updated_at_unix": time.Now().UTC().Unix(),
	}
	if trimmed == "" {
		updates["forced_execution_mode"] = nil
	} else {
		updates["forced_execution_mode"] = trimmed
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gSessionOwnership{}).Where("session_id = ?", sessionID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("update forced execution mode: %w", err)
	}
	return nil
}

func (s *SessionOwnershipStore) UpdateWorkspacePath(ctx context.Context, sessionID, path string) error {
	updates := map[string]any{
		"updated_at_unix": time.Now().UTC().Unix(),
	}
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		updates["workspace_path"] = nil
	} else {
		updates["workspace_path"] = trimmed
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gSessionOwnership{}).Where("session_id = ?", sessionID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("update workspace path: %w", err)
	}
	return nil
}

func (s *SessionOwnershipStore) UpdateProjectPath(ctx context.Context, sessionID, path string) error {
	updates := map[string]any{
		"updated_at_unix": time.Now().UTC().Unix(),
	}
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		updates["project_path"] = nil
	} else {
		updates["project_path"] = trimmed
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gSessionOwnership{}).Where("session_id = ?", sessionID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("update project path: %w", err)
	}
	return nil
}

func (s *SessionOwnershipStore) UpdateProviderSelection(ctx context.Context, sessionID, providerSettingID, modelID string) error {
	updates := map[string]any{
		"updated_at_unix": time.Now().UTC().Unix(),
	}
	if strings.TrimSpace(providerSettingID) == "" {
		updates["provider_setting_id"] = nil
		updates["model_id"] = nil
	} else {
		updates["provider_setting_id"] = providerSettingID
		if strings.TrimSpace(modelID) == "" {
			updates["model_id"] = nil
		} else {
			updates["model_id"] = modelID
		}
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gSessionOwnership{}).Where("session_id = ?", sessionID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("update session provider selection: %w", err)
	}
	return nil
}
