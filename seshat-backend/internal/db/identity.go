package db

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	UserStatusActive   = "active"
	UserStatusDisabled = "disabled"
)

// ─── Public types ─────────────────────────────────────────────────────────────

// User is the shared application-level identity record.
type User struct {
	ID           string
	Email        string
	DisplayName  string
	Username     *string
	Bio          *string
	AvatarURL    *string
	PasswordHash string
	Status       string
	LastActiveAt *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Metadata     map[string]any
	Settings     map[string]any
}

// Role is the shared application-level authorization role record.
type Role struct {
	ID          string
	Name        string
	Description string
	IsSystem    bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Metadata    map[string]any
}

// CreateUserParams captures the minimal identity fields needed to create an
// application user record.
type CreateUserParams struct {
	Email        string
	DisplayName  string
	PasswordHash string
	Status       string
	Metadata     map[string]any
}

type UpdateUserParams struct {
	ID           string
	DisplayName  *string
	PasswordHash *string
	Status       *string
}

// UpdateUserProfileParams is used to update rich profile fields.
type UpdateUserProfileParams struct {
	ID          string
	DisplayName *string
	Username    *string
	Bio         *string
	AvatarURL   *string
}

// ListUsersParams is used to list users with pagination and filters.
type ListUsersParams struct {
	Search     string
	RoleFilter string
	Page       int
	PerPage    int
}

// ─── GORM private models ──────────────────────────────────────────────────────

type gUser struct {
	ID               string  `gorm:"primaryKey;size:64"`
	Email            string  `gorm:"uniqueIndex;size:191;not null"`
	DisplayName      string  `gorm:"column:display_name;not null;default:''"`
	Username         *string `gorm:"column:username;uniqueIndex;size:64"`
	Bio              *string `gorm:"column:bio"`
	AvatarURL        *string `gorm:"column:avatar_url;size:512"`
	PasswordHash     *string `gorm:"column:password_hash;size:191"`
	Status           string  `gorm:"not null"`
	LastActiveAtUnix *int64  `gorm:"column:last_active_at_unix"`
	CreatedAtUnix    int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix    int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	MetadataJSON     string  `gorm:"column:metadata_json;not null;default:'{}'"`
	SettingsJSON     string  `gorm:"column:settings_json;not null;default:'{}'"`
}

func (gUser) TableName() string { return "users" }

type gRole struct {
	ID            string `gorm:"primaryKey;size:64"`
	Name          string `gorm:"uniqueIndex;size:191;not null"`
	Description   string `gorm:"not null;default:''"`
	IsSystem      int    `gorm:"column:is_system;not null;default:0"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	MetadataJSON  string `gorm:"column:metadata_json;not null;default:'{}'"`
}

func (gRole) TableName() string { return "roles" }

type gUserRole struct {
	UserID         string `gorm:"primaryKey;size:64;column:user_id"`
	RoleID         string `gorm:"primaryKey;size:64;column:role_id"`
	AssignedAtUnix int64  `gorm:"column:assigned_at_unix;autoCreateTime:unix"`
}

func (gUserRole) TableName() string { return "user_roles" }

// ─── Conversion helpers ───────────────────────────────────────────────────────

func userFromGorm(g gUser) (*User, error) {
	metadata, err := unmarshalJSONMap(g.MetadataJSON)
	if err != nil {
		return nil, fmt.Errorf("unmarshal user metadata: %w", err)
	}
	settings, err := unmarshalJSONMap(g.SettingsJSON)
	if err != nil {
		return nil, fmt.Errorf("unmarshal user settings: %w", err)
	}
	u := &User{
		ID:          g.ID,
		Email:       g.Email,
		DisplayName: g.DisplayName,
		Username:    g.Username,
		Bio:         g.Bio,
		AvatarURL:   g.AvatarURL,
		Status:      g.Status,
		CreatedAt:   time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt:   time.Unix(g.UpdatedAtUnix, 0).UTC(),
		Metadata:    metadata,
		Settings:    settings,
	}
	if g.PasswordHash != nil {
		u.PasswordHash = *g.PasswordHash
	}
	if g.LastActiveAtUnix != nil {
		t := time.Unix(*g.LastActiveAtUnix, 0).UTC()
		u.LastActiveAt = &t
	}
	return u, nil
}

func roleFromGorm(g gRole) (*Role, error) {
	metadata, err := unmarshalJSONMap(g.MetadataJSON)
	if err != nil {
		return nil, fmt.Errorf("unmarshal role metadata: %w", err)
	}
	return &Role{
		ID:          g.ID,
		Name:        g.Name,
		Description: g.Description,
		IsSystem:    g.IsSystem != 0,
		CreatedAt:   time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt:   time.Unix(g.UpdatedAtUnix, 0).UTC(),
		Metadata:    metadata,
	}, nil
}

// ─── IdentityStore ────────────────────────────────────────────────────────────

// IdentityStore provides minimal persistence operations for users and roles on
// top of the shared DB module.
type IdentityStore struct {
	db *DB
}

func NewIdentityStore(database *DB) (*IdentityStore, error) {
	if database == nil {
		return nil, fmt.Errorf("database is required")
	}
	return &IdentityStore{db: database}, nil
}

func (s *IdentityStore) CreateUser(ctx context.Context, params CreateUserParams) (*User, error) {
	email := strings.TrimSpace(strings.ToLower(params.Email))
	if email == "" {
		return nil, fmt.Errorf("email is required")
	}

	status := params.Status
	if status == "" {
		status = UserStatusActive
	}
	now := time.Now().UTC()
	metadata, err := normalizeJSONMap(params.Metadata)
	if err != nil {
		return nil, fmt.Errorf("normalize user metadata: %w", err)
	}
	metadataJSON, err := marshalJSONMap(metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal user metadata: %w", err)
	}

	id := newIdentityID("usr")
	displayName := strings.TrimSpace(params.DisplayName)
	nowUnix := now.Unix()

	row := gUser{
		ID:            id,
		Email:         email,
		DisplayName:   displayName,
		Status:        status,
		CreatedAtUnix: nowUnix,
		UpdatedAtUnix: nowUnix,
		MetadataJSON:  metadataJSON,
	}
	if params.PasswordHash != "" {
		row.PasswordHash = &params.PasswordHash
	}

	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	return &User{
		ID:           id,
		Email:        email,
		DisplayName:  displayName,
		PasswordHash: params.PasswordHash,
		Status:       status,
		CreatedAt:    now,
		UpdatedAt:    now,
		Metadata:     metadata,
	}, nil
}

func (s *IdentityStore) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var row gUser
	err := s.db.GormDB().WithContext(ctx).
		Where("email = ?", strings.TrimSpace(strings.ToLower(email))).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return userFromGorm(row)
}

func (s *IdentityStore) GetUserByID(ctx context.Context, userID string) (*User, error) {
	var row gUser
	err := s.db.GormDB().WithContext(ctx).
		Where("id = ?", strings.TrimSpace(userID)).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return userFromGorm(row)
}

func (s *IdentityStore) GetRoleByName(ctx context.Context, name string) (*Role, error) {
	var row gRole
	err := s.db.GormDB().WithContext(ctx).
		Where("name = ?", strings.TrimSpace(strings.ToLower(name))).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("role not found")
		}
		return nil, fmt.Errorf("get role by name: %w", err)
	}
	return roleFromGorm(row)
}

func (s *IdentityStore) ListRoles(ctx context.Context) ([]Role, error) {
	var rows []gRole
	if err := s.db.GormDB().WithContext(ctx).Order("name ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("query roles: %w", err)
	}
	roles := make([]Role, 0, len(rows))
	for _, r := range rows {
		role, err := roleFromGorm(r)
		if err != nil {
			return nil, err
		}
		roles = append(roles, *role)
	}
	return roles, nil
}

func (s *IdentityStore) ListUsers(ctx context.Context) ([]User, error) {
	var rows []gUser
	if err := s.db.GormDB().WithContext(ctx).Order("created_at_unix ASC, email ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("query users: %w", err)
	}
	users := make([]User, 0, len(rows))
	for _, r := range rows {
		u, err := userFromGorm(r)
		if err != nil {
			return nil, err
		}
		users = append(users, *u)
	}
	return users, nil
}

// ListUsersPaginated returns a paginated, searchable, filterable list of users.
func (s *IdentityStore) ListUsersPaginated(ctx context.Context, params ListUsersParams) ([]User, int64, error) {
	page := params.Page
	if page < 1 {
		page = 1
	}
	perPage := params.PerPage
	if perPage < 1 {
		perPage = 30
	}

	q := s.db.GormDB().WithContext(ctx).Model(&gUser{})

	if params.Search != "" {
		like := "%" + params.Search + "%"
		q = q.Where("email LIKE ? OR display_name LIKE ?", like, like)
	}

	if params.RoleFilter != "" {
		q = q.Joins("INNER JOIN user_roles ur ON ur.user_id = users.id").
			Joins("INNER JOIN roles r ON r.id = ur.role_id").
			Where("r.name = ?", params.RoleFilter)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	var rows []gUser
	offset := (page - 1) * perPage
	if err := q.Order("created_at_unix ASC, email ASC").
		Limit(perPage).
		Offset(offset).
		Find(&rows).Error; err != nil {
		return nil, 0, fmt.Errorf("query users paginated: %w", err)
	}

	users := make([]User, 0, len(rows))
	for _, r := range rows {
		u, err := userFromGorm(r)
		if err != nil {
			return nil, 0, err
		}
		users = append(users, *u)
	}
	return users, total, nil
}

// CountUsers returns the total number of users in the database.
func (s *IdentityStore) CountUsers(ctx context.Context) (int64, error) {
	var count int64
	if err := s.db.GormDB().WithContext(ctx).Model(&gUser{}).Count(&count).Error; err != nil {
		return 0, fmt.Errorf("count users: %w", err)
	}
	return count, nil
}

// GetUserByUsername retrieves a user by their unique username.
func (s *IdentityStore) GetUserByUsername(ctx context.Context, username string) (*User, error) {
	var row gUser
	err := s.db.GormDB().WithContext(ctx).
		Where("username = ?", strings.TrimSpace(username)).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("get user by username: %w", err)
	}
	return userFromGorm(row)
}

// UpdateUserProfile updates rich profile fields for a user.
func (s *IdentityStore) UpdateUserProfile(ctx context.Context, params UpdateUserProfileParams) (*User, error) {
	user, err := s.GetUserByID(ctx, params.ID)
	if err != nil {
		return nil, err
	}

	updates := map[string]any{
		"updated_at_unix": time.Now().UTC().Unix(),
	}

	if params.DisplayName != nil {
		display := strings.TrimSpace(*params.DisplayName)
		user.DisplayName = display
		updates["display_name"] = display
	}
	if params.Username != nil {
		uname := strings.TrimSpace(*params.Username)
		if uname == "" {
			updates["username"] = nil
		} else {
			updates["username"] = uname
		}
		user.Username = params.Username
	}
	if params.Bio != nil {
		updates["bio"] = *params.Bio
		user.Bio = params.Bio
	}
	if params.AvatarURL != nil {
		updates["avatar_url"] = *params.AvatarURL
		user.AvatarURL = params.AvatarURL
	}

	if err := s.db.GormDB().WithContext(ctx).
		Model(&gUser{}).Where("id = ?", user.ID).
		Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update user profile: %w", err)
	}
	return user, nil
}

// UpdateUserSettings merges updates into the user's settings JSON.
func (s *IdentityStore) UpdateUserSettings(ctx context.Context, userID string, settings map[string]any) (*User, error) {
	user, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	if user.Settings == nil {
		user.Settings = map[string]any{}
	}
	for k, v := range settings {
		user.Settings[k] = v
	}

	settingsJSON, err := marshalJSONMap(user.Settings)
	if err != nil {
		return nil, fmt.Errorf("marshal user settings: %w", err)
	}

	now := time.Now().UTC().Unix()
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gUser{}).Where("id = ?", userID).
		Updates(map[string]any{
			"settings_json":   settingsJSON,
			"updated_at_unix": now,
		}).Error; err != nil {
		return nil, fmt.Errorf("update user settings: %w", err)
	}
	return user, nil
}

// TouchUserLastActive updates the last_active_at_unix timestamp for a user.
func (s *IdentityStore) TouchUserLastActive(ctx context.Context, userID string) error {
	now := time.Now().UTC().Unix()
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gUser{}).Where("id = ?", userID).
		Updates(map[string]any{
			"last_active_at_unix": now,
			"updated_at_unix":     now,
		}).Error; err != nil {
		return fmt.Errorf("touch user last active: %w", err)
	}
	return nil
}

func (s *IdentityStore) UpdateUser(ctx context.Context, params UpdateUserParams) (*User, error) {
	user, err := s.GetUserByID(ctx, params.ID)
	if err != nil {
		return nil, err
	}
	if params.DisplayName != nil {
		user.DisplayName = strings.TrimSpace(*params.DisplayName)
	}
	if params.PasswordHash != nil {
		user.PasswordHash = *params.PasswordHash
	}
	if params.Status != nil {
		user.Status = strings.TrimSpace(*params.Status)
	}
	user.UpdatedAt = time.Now().UTC()

	metadataJSON, err := marshalJSONMap(user.Metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal user metadata: %w", err)
	}
	settingsJSON, err := marshalJSONMap(user.Settings)
	if err != nil {
		return nil, fmt.Errorf("marshal user settings: %w", err)
	}

	updates := map[string]any{
		"display_name":    user.DisplayName,
		"status":          user.Status,
		"updated_at_unix": user.UpdatedAt.Unix(),
		"metadata_json":   metadataJSON,
		"settings_json":   settingsJSON,
	}
	if user.PasswordHash != "" {
		updates["password_hash"] = user.PasswordHash
	} else {
		updates["password_hash"] = nil
	}

	if err := s.db.GormDB().WithContext(ctx).
		Model(&gUser{}).Where("id = ?", user.ID).
		Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return user, nil
}

func (s *IdentityStore) DeleteUser(ctx context.Context, userID string) error {
	if err := s.db.GormDB().WithContext(ctx).
		Delete(&gUser{}, "id = ?", strings.TrimSpace(userID)).Error; err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	return nil
}

func (s *IdentityStore) AssignRoleToUser(ctx context.Context, userID string, roleName string) error {
	role, err := s.GetRoleByName(ctx, roleName)
	if err != nil {
		return err
	}
	row := gUserRole{
		UserID:         userID,
		RoleID:         role.ID,
		AssignedAtUnix: time.Now().UTC().Unix(),
	}
	if err := s.db.GormDB().WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&row).Error; err != nil {
		return fmt.Errorf("assign role %q to user %q: %w", roleName, userID, err)
	}
	return nil
}

// ReplaceUserRoles clears every role currently assigned to userID and assigns
// exactly roleNames instead, in a single transaction. Used for admin-driven
// "set this user's role to X" updates, as opposed to AssignRoleToUser which
// only ever adds (used at account creation, where roles start from empty).
func (s *IdentityStore) ReplaceUserRoles(ctx context.Context, userID string, roleNames ...string) error {
	return s.db.GormDB().WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ?", userID).Delete(&gUserRole{}).Error; err != nil {
			return fmt.Errorf("clear roles for user %q: %w", userID, err)
		}
		for _, name := range roleNames {
			var role gRole
			if err := tx.Where("name = ?", strings.TrimSpace(strings.ToLower(name))).First(&role).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("role %q not found", name)
				}
				return fmt.Errorf("look up role %q: %w", name, err)
			}
			row := gUserRole{
				UserID:         userID,
				RoleID:         role.ID,
				AssignedAtUnix: time.Now().UTC().Unix(),
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
				return fmt.Errorf("assign role %q to user %q: %w", name, userID, err)
			}
		}
		return nil
	})
}

func (s *IdentityStore) ListUserRoles(ctx context.Context, userID string) ([]Role, error) {
	var rows []gRole
	if err := s.db.GormDB().WithContext(ctx).
		Joins("INNER JOIN user_roles ur ON ur.role_id = roles.id").
		Where("ur.user_id = ?", userID).
		Order("name ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("query user roles: %w", err)
	}
	roles := make([]Role, 0, len(rows))
	for _, r := range rows {
		role, err := roleFromGorm(r)
		if err != nil {
			return nil, err
		}
		roles = append(roles, *role)
	}
	return roles, nil
}

func (s *IdentityStore) AuthenticateUser(ctx context.Context, email, plaintextPassword string) (*User, error) {
	user, err := s.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if user.Status != UserStatusActive {
		return nil, fmt.Errorf("user is not active")
	}
	if err := VerifyPassword(user.PasswordHash, plaintextPassword); err != nil {
		return nil, err
	}
	return user, nil
}

// ─── JSON helpers (shared across the package) ─────────────────────────────────

func normalizeJSONMap(input map[string]any) (map[string]any, error) {
	if input == nil {
		return map[string]any{}, nil
	}
	normalized, err := cloneJSONMap(input)
	if err != nil {
		return nil, err
	}
	if normalized == nil {
		return map[string]any{}, nil
	}
	return normalized, nil
}

func marshalJSONMap(value map[string]any) (string, error) {
	normalized, err := normalizeJSONMap(value)
	if err != nil {
		return "", err
	}
	data, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func unmarshalJSONMap(payload string) (map[string]any, error) {
	if payload == "" {
		return map[string]any{}, nil
	}
	var value map[string]any
	if err := json.Unmarshal([]byte(payload), &value); err != nil {
		return nil, err
	}
	if value == nil {
		return map[string]any{}, nil
	}
	return value, nil
}

func cloneJSONMap(value map[string]any) (map[string]any, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var cloned map[string]any
	if err := json.Unmarshal(data, &cloned); err != nil {
		return nil, err
	}
	return cloned, nil
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func newIdentityID(prefix string) string {
	var randomBytes [8]byte
	if _, err := rand.Read(randomBytes[:]); err != nil {
		return fmt.Sprintf("%s_%d", prefix, time.Now().UTC().UnixNano())
	}
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(randomBytes[:]))
}

// scanner interface kept for backward compat (used by auth.go scanAuthSession).
type scanner interface {
	Scan(dest ...any) error
}
