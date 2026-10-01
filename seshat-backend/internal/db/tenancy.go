package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	OrganizationStatusActive = "active"
	WorkspaceStatusActive    = "active"
)

// Organization/Workspace/WorkspaceMembership exist in the local, single-user
// desktop database too — EnsureBootstrap (bootstrap.go) always creates one
// "Default Organization" and "Main Workspace" for the sole local user, even
// though nothing in that install has more than one member. This is
// deliberate anticipation of a future local multi-profile mode (several
// local accounts sharing one seshat-backend instance), not an accident —
// but as of 2026-08-10 that future mode doesn't exist yet, so today every
// local install carries this schema, and the full CRUD routes on
// /organizations, /workspaces, /groups (see routes.go), purely as unused
// surface. See helps/audit-2026-08-10.md §3/§7.3 for the audit finding and
// the decision to document this rather than simplify the schema now — a
// real simplification (e.g. an implicit singleton workspace with no CRUD
// API) is deferred to Phase 3 of that audit's plan, once/if local
// multi-profile is scoped for real, since it touches live migrations.
//
// ─── Public types ─────────────────────────────────────────────────────────────

type Organization struct {
	ID          string
	Name        string
	Slug        string
	OwnerUserID string
	Status      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Metadata    map[string]any
}

type Workspace struct {
	ID             string
	OrganizationID string
	Name           string
	Slug           string
	Status         string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Metadata       map[string]any
}

type WorkspaceMembership struct {
	WorkspaceID      string
	UserID           string
	RoleID           string
	RoleName         string
	WorkspaceSlug    string
	OrganizationID   string
	OrganizationSlug string
	CreatedAt        time.Time
}

type CreateOrganizationParams struct {
	Name        string
	Slug        string
	OwnerUserID string
	Status      string
	Metadata    map[string]any
}

type UpdateOrganizationParams struct {
	ID     string
	Name   *string
	Slug   *string
	Status *string
}

type CreateWorkspaceParams struct {
	OrganizationID string
	Name           string
	Slug           string
	Status         string
	Metadata       map[string]any
}

type UpdateWorkspaceParams struct {
	ID             string
	OrganizationID *string
	Name           *string
	Slug           *string
	Status         *string
}

// ─── GORM private models ──────────────────────────────────────────────────────

type gOrganization struct {
	ID            string  `gorm:"primaryKey;size:64"`
	Name          string  `gorm:"not null"`
	Slug          string  `gorm:"uniqueIndex;size:191;not null"`
	OwnerUserID   *string `gorm:"column:owner_user_id;size:64"`
	Status        string  `gorm:"not null"`
	CreatedAtUnix int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	MetadataJSON  string  `gorm:"column:metadata_json;not null;default:'{}'"`
}

func (gOrganization) TableName() string { return "organizations" }

type gWorkspace struct {
	ID             string `gorm:"primaryKey;size:64"`
	OrganizationID string `gorm:"column:organization_id;size:64;not null;uniqueIndex:idx_org_ws_slug"`
	Name           string `gorm:"not null"`
	Slug           string `gorm:"size:191;not null;uniqueIndex:idx_org_ws_slug"`
	Status         string `gorm:"not null"`
	CreatedAtUnix  int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix  int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	MetadataJSON   string `gorm:"column:metadata_json;not null;default:'{}'"`
}

func (gWorkspace) TableName() string { return "workspaces" }

type gWorkspaceMembership struct {
	WorkspaceID   string `gorm:"primaryKey;size:64;column:workspace_id"`
	UserID        string `gorm:"primaryKey;size:64;column:user_id"`
	RoleID        string `gorm:"primaryKey;size:64;column:role_id"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gWorkspaceMembership) TableName() string { return "workspace_memberships" }

// ─── Conversion helpers ───────────────────────────────────────────────────────

func orgFromGorm(g gOrganization) (*Organization, error) {
	metadata, err := unmarshalJSONMap(g.MetadataJSON)
	if err != nil {
		return nil, fmt.Errorf("unmarshal organization metadata: %w", err)
	}
	o := &Organization{
		ID:        g.ID,
		Name:      g.Name,
		Slug:      g.Slug,
		Status:    g.Status,
		CreatedAt: time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt: time.Unix(g.UpdatedAtUnix, 0).UTC(),
		Metadata:  metadata,
	}
	if g.OwnerUserID != nil {
		o.OwnerUserID = *g.OwnerUserID
	}
	return o, nil
}

func wsFromGorm(g gWorkspace) (*Workspace, error) {
	metadata, err := unmarshalJSONMap(g.MetadataJSON)
	if err != nil {
		return nil, fmt.Errorf("unmarshal workspace metadata: %w", err)
	}
	return &Workspace{
		ID:             g.ID,
		OrganizationID: g.OrganizationID,
		Name:           g.Name,
		Slug:           g.Slug,
		Status:         g.Status,
		CreatedAt:      time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt:      time.Unix(g.UpdatedAtUnix, 0).UTC(),
		Metadata:       metadata,
	}, nil
}

// ─── Methods on IdentityStore ─────────────────────────────────────────────────

func (s *IdentityStore) CreateOrganization(ctx context.Context, params CreateOrganizationParams) (*Organization, error) {
	name := strings.TrimSpace(params.Name)
	if name == "" {
		return nil, fmt.Errorf("organization name is required")
	}
	slug := normalizeSlug(params.Slug, name)
	if slug == "" {
		return nil, fmt.Errorf("organization slug is required")
	}
	status := params.Status
	if status == "" {
		status = OrganizationStatusActive
	}
	metadata, err := normalizeJSONMap(params.Metadata)
	if err != nil {
		return nil, fmt.Errorf("normalize organization metadata: %w", err)
	}
	metadataJSON, err := marshalJSONMap(metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal organization metadata: %w", err)
	}

	ownerUserID := strings.TrimSpace(params.OwnerUserID)
	now := time.Now().UTC()
	row := gOrganization{
		ID:            newIdentityID("org"),
		Name:          name,
		Slug:          slug,
		Status:        status,
		CreatedAtUnix: now.Unix(),
		UpdatedAtUnix: now.Unix(),
		MetadataJSON:  metadataJSON,
	}
	if ownerUserID != "" {
		row.OwnerUserID = &ownerUserID
	}

	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("insert organization: %w", err)
	}
	return &Organization{
		ID:          row.ID,
		Name:        name,
		Slug:        slug,
		OwnerUserID: ownerUserID,
		Status:      status,
		CreatedAt:   now,
		UpdatedAt:   now,
		Metadata:    metadata,
	}, nil
}

func (s *IdentityStore) CreateWorkspace(ctx context.Context, params CreateWorkspaceParams) (*Workspace, error) {
	if strings.TrimSpace(params.OrganizationID) == "" {
		return nil, fmt.Errorf("organization id is required")
	}
	name := strings.TrimSpace(params.Name)
	if name == "" {
		return nil, fmt.Errorf("workspace name is required")
	}
	slug := normalizeSlug(params.Slug, name)
	if slug == "" {
		return nil, fmt.Errorf("workspace slug is required")
	}
	status := params.Status
	if status == "" {
		status = WorkspaceStatusActive
	}
	metadata, err := normalizeJSONMap(params.Metadata)
	if err != nil {
		return nil, fmt.Errorf("normalize workspace metadata: %w", err)
	}
	metadataJSON, err := marshalJSONMap(metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal workspace metadata: %w", err)
	}

	now := time.Now().UTC()
	row := gWorkspace{
		ID:             newIdentityID("ws"),
		OrganizationID: params.OrganizationID,
		Name:           name,
		Slug:           slug,
		Status:         status,
		CreatedAtUnix:  now.Unix(),
		UpdatedAtUnix:  now.Unix(),
		MetadataJSON:   metadataJSON,
	}

	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("insert workspace: %w", err)
	}
	return &Workspace{
		ID:             row.ID,
		OrganizationID: params.OrganizationID,
		Name:           name,
		Slug:           slug,
		Status:         status,
		CreatedAt:      now,
		UpdatedAt:      now,
		Metadata:       metadata,
	}, nil
}

func (s *IdentityStore) AddWorkspaceMember(ctx context.Context, workspaceID, userID, roleName string) error {
	role, err := s.GetRoleByName(ctx, roleName)
	if err != nil {
		return err
	}
	row := gWorkspaceMembership{
		WorkspaceID:   workspaceID,
		UserID:        userID,
		RoleID:        role.ID,
		CreatedAtUnix: time.Now().UTC().Unix(),
	}
	if err := s.db.GormDB().WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&row).Error; err != nil {
		return fmt.Errorf("add workspace member: %w", err)
	}
	return nil
}

func (s *IdentityStore) ListWorkspaceMembers(ctx context.Context, workspaceID string) ([]WorkspaceMembership, error) {
	type memberRow struct {
		WorkspaceID   string `gorm:"column:workspace_id"`
		UserID        string `gorm:"column:user_id"`
		RoleID        string `gorm:"column:role_id"`
		RoleName      string `gorm:"column:role_name"`
		CreatedAtUnix int64  `gorm:"column:created_at_unix"`
	}
	var rows []memberRow
	if err := s.db.GormDB().WithContext(ctx).Raw(
		`SELECT wm.workspace_id, wm.user_id, wm.role_id, r.name AS role_name, wm.created_at_unix
		 FROM workspace_memberships wm
		 INNER JOIN roles r ON r.id = wm.role_id
		 WHERE wm.workspace_id = ?
		 ORDER BY r.name ASC, wm.user_id ASC`,
		workspaceID,
	).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("query workspace members: %w", err)
	}

	memberships := make([]WorkspaceMembership, 0, len(rows))
	for _, r := range rows {
		memberships = append(memberships, WorkspaceMembership{
			WorkspaceID: r.WorkspaceID,
			UserID:      r.UserID,
			RoleID:      r.RoleID,
			RoleName:    r.RoleName,
			CreatedAt:   time.Unix(r.CreatedAtUnix, 0).UTC(),
		})
	}
	return memberships, nil
}

func (s *IdentityStore) ListUserWorkspaceMemberships(ctx context.Context, userID string) ([]WorkspaceMembership, error) {
	type membershipRow struct {
		WorkspaceID      string `gorm:"column:workspace_id"`
		UserID           string `gorm:"column:user_id"`
		RoleID           string `gorm:"column:role_id"`
		RoleName         string `gorm:"column:role_name"`
		WorkspaceSlug    string `gorm:"column:workspace_slug"`
		OrganizationID   string `gorm:"column:organization_id"`
		OrganizationSlug string `gorm:"column:org_slug"`
		CreatedAtUnix    int64  `gorm:"column:created_at_unix"`
	}
	var rows []membershipRow
	if err := s.db.GormDB().WithContext(ctx).Raw(
		`SELECT wm.workspace_id, wm.user_id, wm.role_id, r.name AS role_name, w.slug AS workspace_slug,
		        w.organization_id, o.slug AS org_slug, wm.created_at_unix
		 FROM workspace_memberships wm
		 INNER JOIN roles r ON r.id = wm.role_id
		 INNER JOIN workspaces w ON w.id = wm.workspace_id
		 INNER JOIN organizations o ON o.id = w.organization_id
		 WHERE wm.user_id = ?
		 ORDER BY o.slug ASC, w.slug ASC, r.name ASC`, userID,
	).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("query user workspace memberships: %w", err)
	}

	memberships := make([]WorkspaceMembership, 0, len(rows))
	for _, r := range rows {
		memberships = append(memberships, WorkspaceMembership{
			WorkspaceID:      r.WorkspaceID,
			UserID:           r.UserID,
			RoleID:           r.RoleID,
			RoleName:         r.RoleName,
			WorkspaceSlug:    r.WorkspaceSlug,
			OrganizationID:   r.OrganizationID,
			OrganizationSlug: r.OrganizationSlug,
			CreatedAt:        time.Unix(r.CreatedAtUnix, 0).UTC(),
		})
	}
	return memberships, nil
}

func normalizeSlug(explicit, fallback string) string {
	value := strings.TrimSpace(strings.ToLower(explicit))
	if value == "" {
		value = strings.TrimSpace(strings.ToLower(fallback))
	}
	value = strings.ReplaceAll(value, "_", "-")
	value = strings.Join(strings.Fields(value), "-")
	for strings.Contains(value, "--") {
		value = strings.ReplaceAll(value, "--", "-")
	}
	return strings.Trim(value, "-")
}

func (s *IdentityStore) GetOrganizationBySlug(ctx context.Context, slug string) (*Organization, error) {
	var row gOrganization
	err := s.db.GormDB().WithContext(ctx).
		Where("slug = ?", normalizeSlug(slug, "")).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("organization not found")
		}
		return nil, fmt.Errorf("get organization by slug: %w", err)
	}
	return orgFromGorm(row)
}

func (s *IdentityStore) ListOrganizations(ctx context.Context) ([]Organization, error) {
	var rows []gOrganization
	if err := s.db.GormDB().WithContext(ctx).
		Order("created_at_unix ASC, slug ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("query organizations: %w", err)
	}
	orgs := make([]Organization, 0, len(rows))
	for _, r := range rows {
		o, err := orgFromGorm(r)
		if err != nil {
			return nil, err
		}
		orgs = append(orgs, *o)
	}
	return orgs, nil
}

func (s *IdentityStore) ListOrganizationsForUser(ctx context.Context, userID string) ([]Organization, error) {
	var rows []gOrganization
	if err := s.db.GormDB().WithContext(ctx).Raw(
		`SELECT DISTINCT o.id, o.name, o.slug, o.owner_user_id, o.status, o.created_at_unix, o.updated_at_unix, o.metadata_json
		 FROM organizations o
		 INNER JOIN workspaces w ON w.organization_id = o.id
		 INNER JOIN workspace_memberships wm ON wm.workspace_id = w.id
		 WHERE wm.user_id = ?
		 ORDER BY o.slug ASC`, userID,
	).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("query user organizations: %w", err)
	}
	orgs := make([]Organization, 0, len(rows))
	for _, r := range rows {
		o, err := orgFromGorm(r)
		if err != nil {
			return nil, err
		}
		orgs = append(orgs, *o)
	}
	return orgs, nil
}

func (s *IdentityStore) GetOrganizationByID(ctx context.Context, id string) (*Organization, error) {
	var row gOrganization
	err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("organization not found")
		}
		return nil, fmt.Errorf("get organization by id: %w", err)
	}
	return orgFromGorm(row)
}

func (s *IdentityStore) UpdateOrganization(ctx context.Context, params UpdateOrganizationParams) (*Organization, error) {
	org, err := s.GetOrganizationByID(ctx, params.ID)
	if err != nil {
		return nil, err
	}
	if params.Name != nil {
		org.Name = strings.TrimSpace(*params.Name)
	}
	if params.Slug != nil {
		org.Slug = normalizeSlug(*params.Slug, org.Name)
	}
	if params.Status != nil {
		org.Status = strings.TrimSpace(*params.Status)
	}
	org.UpdatedAt = time.Now().UTC()

	metadataJSON, err := marshalJSONMap(org.Metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal organization metadata: %w", err)
	}
	updates := map[string]any{
		"name":            org.Name,
		"slug":            org.Slug,
		"status":          org.Status,
		"updated_at_unix": org.UpdatedAt.Unix(),
		"metadata_json":   metadataJSON,
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gOrganization{}).Where("id = ?", org.ID).
		Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update organization: %w", err)
	}
	return org, nil
}

func (s *IdentityStore) DeleteOrganization(ctx context.Context, id string) error {
	if err := s.db.GormDB().WithContext(ctx).
		Delete(&gOrganization{}, "id = ?", id).Error; err != nil {
		return fmt.Errorf("delete organization: %w", err)
	}
	return nil
}

func (s *IdentityStore) GetWorkspaceBySlug(ctx context.Context, organizationID, slug string) (*Workspace, error) {
	var row gWorkspace
	err := s.db.GormDB().WithContext(ctx).
		Where("organization_id = ? AND slug = ?", organizationID, normalizeSlug(slug, "")).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("workspace not found")
		}
		return nil, fmt.Errorf("get workspace by slug: %w", err)
	}
	return wsFromGorm(row)
}

func (s *IdentityStore) ListWorkspaces(ctx context.Context) ([]Workspace, error) {
	var rows []gWorkspace
	if err := s.db.GormDB().WithContext(ctx).
		Order("created_at_unix ASC, slug ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("query workspaces: %w", err)
	}
	workspaces := make([]Workspace, 0, len(rows))
	for _, r := range rows {
		w, err := wsFromGorm(r)
		if err != nil {
			return nil, err
		}
		workspaces = append(workspaces, *w)
	}
	return workspaces, nil
}

func (s *IdentityStore) ListWorkspacesForUser(ctx context.Context, userID string) ([]Workspace, error) {
	var rows []gWorkspace
	if err := s.db.GormDB().WithContext(ctx).Raw(
		`SELECT DISTINCT w.id, w.organization_id, w.name, w.slug, w.status, w.created_at_unix, w.updated_at_unix, w.metadata_json
		 FROM workspaces w
		 INNER JOIN workspace_memberships wm ON wm.workspace_id = w.id
		 WHERE wm.user_id = ?
		 ORDER BY w.slug ASC`, userID,
	).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("query user workspaces: %w", err)
	}
	workspaces := make([]Workspace, 0, len(rows))
	for _, r := range rows {
		w, err := wsFromGorm(r)
		if err != nil {
			return nil, err
		}
		workspaces = append(workspaces, *w)
	}
	return workspaces, nil
}

func (s *IdentityStore) GetWorkspaceByID(ctx context.Context, id string) (*Workspace, error) {
	var row gWorkspace
	err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("workspace not found")
		}
		return nil, fmt.Errorf("get workspace by id: %w", err)
	}
	return wsFromGorm(row)
}

func (s *IdentityStore) UpdateWorkspace(ctx context.Context, params UpdateWorkspaceParams) (*Workspace, error) {
	workspace, err := s.GetWorkspaceByID(ctx, params.ID)
	if err != nil {
		return nil, err
	}
	if params.OrganizationID != nil {
		workspace.OrganizationID = strings.TrimSpace(*params.OrganizationID)
	}
	if params.Name != nil {
		workspace.Name = strings.TrimSpace(*params.Name)
	}
	if params.Slug != nil {
		workspace.Slug = normalizeSlug(*params.Slug, workspace.Name)
	}
	if params.Status != nil {
		workspace.Status = strings.TrimSpace(*params.Status)
	}
	workspace.UpdatedAt = time.Now().UTC()

	metadataJSON, err := marshalJSONMap(workspace.Metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal workspace metadata: %w", err)
	}
	updates := map[string]any{
		"organization_id": workspace.OrganizationID,
		"name":            workspace.Name,
		"slug":            workspace.Slug,
		"status":          workspace.Status,
		"updated_at_unix": workspace.UpdatedAt.Unix(),
		"metadata_json":   metadataJSON,
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gWorkspace{}).Where("id = ?", workspace.ID).
		Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update workspace: %w", err)
	}
	return workspace, nil
}

func (s *IdentityStore) DeleteWorkspace(ctx context.Context, id string) error {
	if err := s.db.GormDB().WithContext(ctx).
		Delete(&gWorkspace{}, "id = ?", id).Error; err != nil {
		return fmt.Errorf("delete workspace: %w", err)
	}
	return nil
}
