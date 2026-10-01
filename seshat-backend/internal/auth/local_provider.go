package auth

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// LocalProvider backs standalone mode: seshat-backend's own SQLite identity
// store. Behavior is unchanged from before this package absorbed
// internal/resources — same checks, same error shapes, just unified behind
// the Provider interface.
type LocalProvider struct {
	identity *db.IdentityStore
	config   ServiceConfig
	// registerMu serializes Register's count-then-promote-to-admin sequence
	// (see Register below) — without it, two concurrent first-ever
	// registrations could both observe "I'm user #1" and both become admin,
	// or under different timing both land as non-admin. A single seshat-backend
	// process is exactly one local desktop API instance per AGENTS.md (never
	// horizontally scaled/replicated), so an in-process mutex fully closes
	// this rather than merely narrowing it.
	registerMu sync.Mutex
}

func NewLocalProvider(identity *db.IdentityStore, cfg ServiceConfig) *LocalProvider {
	return &LocalProvider{identity: identity, config: cfg}
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

func (p *LocalProvider) Login(ctx context.Context, email string, password string) (*LoginResult, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	if strings.TrimSpace(email) == "" || password == "" {
		return nil, bkerr.InvalidInput("email and password are required", nil)
	}

	user, err := p.identity.AuthenticateUser(ctx, email, password)
	if err != nil {
		return nil, bkerr.Unauthorized("invalid credentials", err)
	}

	authSession, token, err := p.identity.CreateLoginSession(ctx, user.ID, 30*24*time.Hour, map[string]any{
		"source": "api_login",
	})
	if err != nil {
		return nil, bkerr.Internal("failed to create auth session", err)
	}

	roles, err := p.identity.ListUserRoles(ctx, user.ID)
	if err != nil {
		return nil, bkerr.Internal("failed to load user roles", err)
	}

	result := &LoginResult{
		Token:     token,
		ExpiresAt: authSession.ExpiresAt,
		User: User{
			ID:          user.ID,
			Email:       user.Email,
			DisplayName: user.DisplayName,
			Status:      user.Status,
		},
		Roles: make([]string, 0, len(roles)),
	}
	for _, role := range roles {
		result.Roles = append(result.Roles, role.Name)
	}
	return result, nil
}

func (p *LocalProvider) ResolvePrincipal(ctx context.Context, token string) (*Principal, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	if strings.TrimSpace(token) == "" {
		return nil, bkerr.Unauthorized("missing bearer token", nil)
	}

	principal, err := p.identity.ResolvePrincipalFromToken(ctx, token)
	if err != nil {
		return nil, bkerr.Unauthorized("invalid auth token", err)
	}
	if err := p.identity.TouchAuthSession(ctx, principal.AuthSession.ID, 30*24*time.Hour); err != nil {
		return nil, bkerr.Internal("failed to update auth session", err)
	}

	return PrincipalFromDB(principal), nil
}

func (p *LocalProvider) Register(ctx context.Context, email, password, displayName string) (*LoginResult, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return nil, bkerr.InvalidInput("email and password are required", nil)
	}
	if len(password) < 8 {
		return nil, bkerr.InvalidInput("password must be at least 8 characters", nil)
	}
	if strings.TrimSpace(displayName) == "" {
		displayName = email
	}

	hash, err := db.HashPassword(password)
	if err != nil {
		return nil, bkerr.Internal("failed to hash password", err)
	}

	// Serializes the whole count-sensitive sequence below against any other
	// concurrent Register call (see registerMu's doc comment): the
	// signup-disabled/first-admin-setup bypass check, user creation, and the
	// "am I user #1" promotion decision all read or depend on the total user
	// count, so two racing registrations both landing inside this section at
	// once — not just the final count-then-assign step — is exactly the
	// unsynchronized-read/write pattern that could double- or zero-admin the
	// instance. Taken only after hashing (CPU-bound, unrelated to the race)
	// so unrelated concurrent signups after an admin already exists aren't
	// serialized on bcrypt, just on these few fast DB calls.
	p.registerMu.Lock()
	defer p.registerMu.Unlock()

	// If signup is disabled, still allow if no users exist (first admin setup).
	if !p.config.EnableSignup {
		count, err := p.identity.CountUsers(ctx)
		if err != nil {
			return nil, bkerr.Internal("failed to check user count", err)
		}
		if count > 0 {
			return nil, bkerr.Forbidden("signup is disabled", nil)
		}
	}

	user, err := p.identity.CreateUser(ctx, db.CreateUserParams{
		Email:        email,
		DisplayName:  displayName,
		PasswordHash: hash,
		Status:       db.UserStatusActive,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("email already registered or invalid", err)
	}

	// First user becomes admin.
	count, err := p.identity.CountUsers(ctx)
	if err != nil {
		return nil, bkerr.Internal("failed to check user count", err)
	}

	role := p.config.DefaultUserRole
	if role == "" {
		role = "member"
	}
	if count == 1 {
		role = "admin"
	}

	if err := p.identity.AssignRoleToUser(ctx, user.ID, role); err != nil {
		return nil, bkerr.Internal("failed to assign role", err)
	}

	return p.Login(ctx, email, password)
}

func (p *LocalProvider) Logout(ctx context.Context, principal *Principal) error {
	if p == nil || p.identity == nil {
		return bkerr.Unavailable("auth not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return err
	}
	if err := p.identity.RevokeAuthSession(ctx, principal.AuthSession.ID); err != nil {
		return bkerr.Internal("failed to revoke auth session", err)
	}
	return nil
}

// ─── Users ────────────────────────────────────────────────────────────────────

func (p *LocalProvider) GetUserByID(ctx context.Context, principal *Principal, userID string) (*db.User, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	user, err := p.identity.GetUserByID(ctx, userID)
	if err != nil {
		return nil, bkerr.NotFound("user not found", err)
	}
	return user, nil
}

func (p *LocalProvider) ListUsersPaginated(ctx context.Context, principal *Principal, params db.ListUsersParams) ([]db.User, int64, error) {
	if p == nil || p.identity == nil {
		return nil, 0, bkerr.Unavailable("auth not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, 0, err
	}
	users, total, err := p.identity.ListUsersPaginated(ctx, params)
	if err != nil {
		return nil, 0, bkerr.Internal("failed to list users", err)
	}
	return users, total, nil
}

func (p *LocalProvider) ListUsers(ctx context.Context, principal *Principal) ([]User, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, err
	}
	users, err := p.identity.ListUsers(ctx)
	if err != nil {
		return nil, bkerr.Internal("failed to list users", err)
	}
	out := make([]User, 0, len(users))
	for _, user := range users {
		copied := user
		out = append(out, userFromDB(&copied))
	}
	return out, nil
}

func (p *LocalProvider) CreateUser(ctx context.Context, principal *Principal, params CreateUserParams) (*User, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, err
	}
	passwordHash, err := db.HashPassword(params.Password)
	if err != nil {
		return nil, bkerr.InvalidInput(err.Error(), err)
	}
	user, err := p.identity.CreateUser(ctx, db.CreateUserParams{
		Email:        params.Email,
		DisplayName:  params.DisplayName,
		PasswordHash: passwordHash,
		Status:       params.Status,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to create user", err)
	}
	for _, roleName := range params.Roles {
		if err := p.identity.AssignRoleToUser(ctx, user.ID, roleName); err != nil {
			return nil, bkerr.InvalidInput("failed to assign role", err)
		}
	}
	result := userFromDB(user)
	return &result, nil
}

func (p *LocalProvider) GetUser(ctx context.Context, principal *Principal, userID string) (*User, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, err
	}
	user, err := p.identity.GetUserByID(ctx, userID)
	if err != nil {
		return nil, bkerr.NotFound("user not found", err)
	}
	result := userFromDB(user)
	return &result, nil
}

func (p *LocalProvider) UpdateUser(ctx context.Context, principal *Principal, userID string, params UpdateUserParams) (*User, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, err
	}
	var passwordHash *string
	if params.Password != nil {
		hashed, err := db.HashPassword(*params.Password)
		if err != nil {
			return nil, bkerr.InvalidInput(err.Error(), err)
		}
		passwordHash = &hashed
	}
	user, err := p.identity.UpdateUser(ctx, db.UpdateUserParams{
		ID:           userID,
		DisplayName:  params.DisplayName,
		PasswordHash: passwordHash,
		Status:       params.Status,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to update user", err)
	}
	if params.Role != nil {
		if err := p.identity.ReplaceUserRoles(ctx, userID, *params.Role); err != nil {
			return nil, bkerr.InvalidInput("failed to update role: "+err.Error(), err)
		}
	}
	roles, err := p.identity.ListUserRoles(ctx, userID)
	if err != nil {
		return nil, bkerr.Internal("failed to load updated roles", err)
	}
	result := userFromDB(user)
	roleNames := make([]string, 0, len(roles))
	for _, role := range roles {
		roleNames = append(roleNames, role.Name)
	}
	result.Roles = roleNames
	return &result, nil
}

// DisableSelf disables the calling principal's own account directly — no
// EnsureAdmin gate, since a principal acting on their own account needs no
// elevated role (EnsureAuthenticated + the confirm_email match already
// performed by Service.DeleteOwnAccount is the actual authorization check).
func (p *LocalProvider) DisableSelf(ctx context.Context, principal *Principal) error {
	if p == nil || p.identity == nil {
		return bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return err
	}
	disabled := db.UserStatusDisabled
	if _, err := p.identity.UpdateUser(ctx, db.UpdateUserParams{ID: principal.User.ID, Status: &disabled}); err != nil {
		return bkerr.Internal("failed to disable account", err)
	}
	return nil
}

func (p *LocalProvider) DeleteUser(ctx context.Context, principal *Principal, userID string) error {
	if p == nil || p.identity == nil {
		return bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return err
	}
	if err := p.identity.DeleteUser(ctx, userID); err != nil {
		return bkerr.InvalidInput("failed to delete user", err)
	}
	return nil
}

// ─── Organizations ────────────────────────────────────────────────────────────

func (p *LocalProvider) ListOrganizations(ctx context.Context, principal *Principal) ([]Organization, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	var (
		orgs []db.Organization
		err  error
	)
	if principal.HasRole("admin") {
		orgs, err = p.identity.ListOrganizations(ctx)
	} else {
		orgs, err = p.identity.ListOrganizationsForUser(ctx, principal.User.ID)
	}
	if err != nil {
		return nil, bkerr.Internal("failed to list organizations", err)
	}
	out := make([]Organization, 0, len(orgs))
	for _, org := range orgs {
		copied := org
		out = append(out, organizationFromDB(&copied))
	}
	return out, nil
}

func (p *LocalProvider) CreateOrganization(ctx context.Context, principal *Principal, params CreateOrganizationParams) (*Organization, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, err
	}
	org, err := p.identity.CreateOrganization(ctx, db.CreateOrganizationParams{
		Name:        params.Name,
		Slug:        params.Slug,
		OwnerUserID: principal.User.ID,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to create organization", err)
	}
	result := organizationFromDB(org)
	return &result, nil
}

func (p *LocalProvider) GetOrganization(ctx context.Context, principal *Principal, organizationID string) (*Organization, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if !principal.CanViewOrganization(organizationID) {
		return nil, bkerr.Forbidden("organization access denied", nil)
	}
	org, err := p.identity.GetOrganizationByID(ctx, organizationID)
	if err != nil {
		return nil, bkerr.NotFound("organization not found", err)
	}
	result := organizationFromDB(org)
	return &result, nil
}

func (p *LocalProvider) UpdateOrganization(ctx context.Context, principal *Principal, organizationID string, params UpdateOrganizationParams) (*Organization, error) {
	if p == nil || p.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, err
	}
	org, err := p.identity.UpdateOrganization(ctx, db.UpdateOrganizationParams{
		ID:     organizationID,
		Name:   params.Name,
		Slug:   params.Slug,
		Status: params.Status,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to update organization", err)
	}
	result := organizationFromDB(org)
	return &result, nil
}

func (p *LocalProvider) DeleteOrganization(ctx context.Context, principal *Principal, organizationID string) error {
	if p == nil || p.identity == nil {
		return bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return err
	}
	if err := p.identity.DeleteOrganization(ctx, organizationID); err != nil {
		return bkerr.InvalidInput("failed to delete organization", err)
	}
	return nil
}

// ─── DB converters ────────────────────────────────────────────────────────────

func userFromDB(user *db.User) User {
	if user == nil {
		return User{}
	}
	return User{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Status:      user.Status,
	}
}

func organizationFromDB(org *db.Organization) Organization {
	if org == nil {
		return Organization{}
	}
	return Organization{
		ID:          org.ID,
		Name:        org.Name,
		Slug:        org.Slug,
		OwnerUserID: org.OwnerUserID,
		Status:      org.Status,
	}
}
