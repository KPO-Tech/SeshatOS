package auth

import (
	"context"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/automation"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// ServiceConfig holds configuration for the auth service.
type ServiceConfig struct {
	EnableSignup    bool
	DefaultUserRole string
	EnableAPIKeys   bool
}

// ProfileUpdateParams is used to update a user's profile.
type ProfileUpdateParams struct {
	DisplayName *string
	Username    *string
	Bio         *string
	AvatarURL   *string
}

type DeleteOwnAccountParams struct {
	ConfirmEmail string
}

// Workspace is always local — it scopes chat sessions/artifacts, not identity
// (see helps/seshat-architecture-target.md §2a). Never delegated to a Provider.
type Workspace struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
	Status         string `json:"status"`
}

type CreateWorkspaceParams struct {
	OrganizationID string
	Name           string
	Slug           string
}

type UpdateWorkspaceParams struct {
	OrganizationID *string
	Name           *string
	Slug           *string
	Status         *string
}

// Service is a thin orchestrator over an injected Provider (Login/Register/
// Logout/ResolvePrincipal/Users/Organizations — local or remote depending on
// mode), plus identity-adjacent concerns that always stay local regardless of
// mode: workspaces, API keys, and rich profile fields that have no
// seshat-server equivalent.
type Service struct {
	provider Provider
	identity *db.IdentityStore // workspaces + profile/settings: always local
	apiKeys  *db.APIKeyStore   // always local
	config   ServiceConfig
	// policies is this device's last-synced desktop policy bundle - nil-safe
	// (a nil *cloudautomation.PolicyStore pointer used via a nil check, not a nil
	// interface method call) so tests that construct a Service directly
	// don't all need to wire one up. See CreateWorkspace's own check.
	policies *cloudautomation.PolicyStore
}

func NewService(provider Provider, identity *db.IdentityStore, apiKeys *db.APIKeyStore, cfg ServiceConfig, policies *cloudautomation.PolicyStore) *Service {
	return &Service{
		provider: provider,
		identity: identity,
		apiKeys:  apiKeys,
		config:   cfg,
		policies: policies,
	}
}

// ─── Auth (delegates to Provider) ──────────────────────────────────────────────

func (s *Service) Login(ctx context.Context, email string, password string) (*LoginResult, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.Login(ctx, email, password)
}

func (s *Service) ResolvePrincipal(ctx context.Context, token string) (*Principal, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.ResolvePrincipal(ctx, token)
}

func (s *Service) Register(ctx context.Context, email, password, displayName string) (*LoginResult, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.Register(ctx, email, password, displayName)
}

func (s *Service) Logout(ctx context.Context, principal *Principal) error {
	if s == nil || s.provider == nil {
		return bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.Logout(ctx, principal)
}

func (s *Service) DeleteOwnAccount(ctx context.Context, principal *Principal, params DeleteOwnAccountParams) error {
	if s == nil || s.provider == nil {
		return bkerr.Unavailable("auth not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return err
	}
	if strings.TrimSpace(principal.AuthSession.ID) == "" {
		return bkerr.Forbidden("account deletion requires a signed-in user session", nil)
	}
	if !strings.EqualFold(strings.TrimSpace(params.ConfirmEmail), strings.TrimSpace(principal.User.Email)) {
		return bkerr.InvalidInput("confirm_email must match your account email", nil)
	}
	if principal.HasRole("admin") {
		_, total, err := s.provider.ListUsersPaginated(ctx, principal, db.ListUsersParams{
			RoleFilter: "admin",
			Page:       1,
			PerPage:    2,
		})
		if err != nil {
			return bkerr.Internal("failed to validate admin deletion safety", err)
		}
		if total <= 1 {
			return bkerr.Forbidden("cannot delete the last admin account", nil)
		}
	}

	if err := s.provider.DisableSelf(ctx, principal); err != nil {
		return err
	}
	if s.apiKeys != nil {
		if err := s.apiKeys.RevokeAllForUser(ctx, principal.User.ID); err != nil {
			return bkerr.Internal("failed to revoke api keys", err)
		}
	}
	if s.identity != nil {
		// In connected mode this deletes 0 rows (local auth_sessions aren't
		// the active session mechanism there — see cloudidentity's
		// principal cache) but a genuine failure should still be reported,
		// not silently discarded.
		if err := s.identity.RevokeAuthSessionsForUser(ctx, principal.User.ID); err != nil {
			return bkerr.Internal("failed to revoke sessions", err)
		}
	}
	return nil
}

// ─── Users (delegates to Provider) ─────────────────────────────────────────────

func (s *Service) GetUserByID(ctx context.Context, principal *Principal, userID string) (*db.User, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.GetUserByID(ctx, principal, userID)
}

func (s *Service) ListUsersPaginated(ctx context.Context, principal *Principal, params db.ListUsersParams) ([]db.User, int64, error) {
	if s == nil || s.provider == nil {
		return nil, 0, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.ListUsersPaginated(ctx, principal, params)
}

func (s *Service) ListUsers(ctx context.Context, principal *Principal) ([]User, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.ListUsers(ctx, principal)
}

func (s *Service) CreateUser(ctx context.Context, principal *Principal, params CreateUserParams) (*User, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.CreateUser(ctx, principal, params)
}

func (s *Service) GetUser(ctx context.Context, principal *Principal, userID string) (*User, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.GetUser(ctx, principal, userID)
}

func (s *Service) UpdateUser(ctx context.Context, principal *Principal, userID string, params UpdateUserParams) (*User, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.UpdateUser(ctx, principal, userID, params)
}

func (s *Service) DeleteUser(ctx context.Context, principal *Principal, userID string) error {
	if s == nil || s.provider == nil {
		return bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.DeleteUser(ctx, principal, userID)
}

// ─── Organizations (delegates to Provider) ─────────────────────────────────────

func (s *Service) ListOrganizations(ctx context.Context, principal *Principal) ([]Organization, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.ListOrganizations(ctx, principal)
}

func (s *Service) CreateOrganization(ctx context.Context, principal *Principal, params CreateOrganizationParams) (*Organization, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.CreateOrganization(ctx, principal, params)
}

func (s *Service) GetOrganization(ctx context.Context, principal *Principal, organizationID string) (*Organization, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.GetOrganization(ctx, principal, organizationID)
}

func (s *Service) UpdateOrganization(ctx context.Context, principal *Principal, organizationID string, params UpdateOrganizationParams) (*Organization, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.UpdateOrganization(ctx, principal, organizationID, params)
}

func (s *Service) DeleteOrganization(ctx context.Context, principal *Principal, organizationID string) error {
	if s == nil || s.provider == nil {
		return bkerr.Unavailable("auth not configured", nil)
	}
	return s.provider.DeleteOrganization(ctx, principal, organizationID)
}

// ─── Workspaces (always local, never delegated — see Workspace doc above) ─────

func (s *Service) ListWorkspaces(ctx context.Context, principal *Principal) ([]Workspace, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	var (
		workspaces []db.Workspace
		err        error
	)
	if principal.HasRole("admin") {
		workspaces, err = s.identity.ListWorkspaces(ctx)
	} else {
		workspaces, err = s.identity.ListWorkspacesForUser(ctx, principal.User.ID)
	}
	if err != nil {
		return nil, bkerr.Internal("failed to list workspaces", err)
	}
	out := make([]Workspace, 0, len(workspaces))
	for _, workspace := range workspaces {
		copied := workspace
		out = append(out, workspaceFromDB(&copied))
	}
	return out, nil
}

func (s *Service) CreateWorkspace(ctx context.Context, principal *Principal, params CreateWorkspaceParams) (*Workspace, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, err
	}
	if s.policies != nil && !s.policies.Allowed(ctx, cloudautomation.DesktopPolicyAllowMultipleWorkspaces) {
		// Workspaces are a whole-device concept (they scope chat sessions/
		// artifacts locally, see Workspace's own doc comment), not scoped to
		// params.OrganizationID - the count that matters is every workspace
		// on this install, admin-wide, the same set ListWorkspaces returns
		// for an admin caller.
		existing, err := s.identity.ListWorkspaces(ctx)
		if err != nil {
			return nil, bkerr.Internal("failed to check existing workspaces", err)
		}
		if len(existing) >= 1 {
			return nil, bkerr.Forbidden("your organization only allows a single workspace on this device", nil)
		}
	}
	workspace, err := s.identity.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		OrganizationID: params.OrganizationID,
		Name:           params.Name,
		Slug:           params.Slug,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to create workspace", err)
	}
	result := workspaceFromDB(workspace)
	return &result, nil
}

func (s *Service) GetWorkspace(ctx context.Context, principal *Principal, workspaceID string) (*Workspace, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if !principal.CanViewWorkspace(workspaceID) {
		return nil, bkerr.Forbidden("workspace access denied", nil)
	}
	workspace, err := s.identity.GetWorkspaceByID(ctx, workspaceID)
	if err != nil {
		return nil, bkerr.NotFound("workspace not found", err)
	}
	result := workspaceFromDB(workspace)
	return &result, nil
}

func (s *Service) UpdateWorkspace(ctx context.Context, principal *Principal, workspaceID string, params UpdateWorkspaceParams) (*Workspace, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return nil, err
	}
	workspace, err := s.identity.UpdateWorkspace(ctx, db.UpdateWorkspaceParams{
		ID:             workspaceID,
		OrganizationID: params.OrganizationID,
		Name:           params.Name,
		Slug:           params.Slug,
		Status:         params.Status,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to update workspace", err)
	}
	result := workspaceFromDB(workspace)
	return &result, nil
}

func (s *Service) DeleteWorkspace(ctx context.Context, principal *Principal, workspaceID string) error {
	if s == nil || s.identity == nil {
		return bkerr.Unavailable("identity store not configured", nil)
	}
	if err := EnsureAdmin(principal); err != nil {
		return err
	}
	if err := s.identity.DeleteWorkspace(ctx, workspaceID); err != nil {
		return bkerr.InvalidInput("failed to delete workspace", err)
	}
	return nil
}

func workspaceFromDB(workspace *db.Workspace) Workspace {
	if workspace == nil {
		return Workspace{}
	}
	return Workspace{
		ID:             workspace.ID,
		OrganizationID: workspace.OrganizationID,
		Name:           workspace.Name,
		Slug:           workspace.Slug,
		Status:         workspace.Status,
	}
}

// ─── API Key methods (always local) ────────────────────────────────────────────

// CreateAPIKey creates a new API key for the given user.
func (s *Service) CreateAPIKey(ctx context.Context, userID, name string, expiresAt *time.Time) (*db.APIKey, error) {
	if s == nil || s.apiKeys == nil {
		return nil, bkerr.Unavailable("api keys not configured", nil)
	}
	if !s.config.EnableAPIKeys {
		return nil, bkerr.Forbidden("api keys are disabled", nil)
	}
	key, err := s.apiKeys.CreateAPIKey(ctx, userID, name, expiresAt)
	if err != nil {
		return nil, bkerr.Internal("failed to create api key", err)
	}
	return key, nil
}

// ListAPIKeys returns all API keys for a user (masked).
func (s *Service) ListAPIKeys(ctx context.Context, userID string) ([]db.APIKey, error) {
	if s == nil || s.apiKeys == nil {
		return nil, bkerr.Unavailable("api keys not configured", nil)
	}
	keys, err := s.apiKeys.ListAPIKeysForUser(ctx, userID)
	if err != nil {
		return nil, bkerr.Internal("failed to list api keys", err)
	}
	return keys, nil
}

// RevokeAPIKey removes an API key.
func (s *Service) RevokeAPIKey(ctx context.Context, keyID, userID string) error {
	if s == nil || s.apiKeys == nil {
		return bkerr.Unavailable("api keys not configured", nil)
	}
	if err := s.apiKeys.RevokeAPIKey(ctx, keyID, userID); err != nil {
		return bkerr.NotFound("api key not found", err)
	}
	return nil
}

// ResolveAPIKeyPrincipal resolves a Principal from an API key token (sk- prefix).
// API keys always authenticate against the local identity store, regardless of
// mode — they have no seshat-server equivalent.
func (s *Service) ResolveAPIKeyPrincipal(ctx context.Context, key string) (*Principal, error) {
	if s == nil || s.apiKeys == nil {
		return nil, bkerr.Unavailable("api keys not configured", nil)
	}
	if !s.config.EnableAPIKeys {
		return nil, bkerr.Forbidden("api keys are disabled", nil)
	}

	user, err := s.apiKeys.GetUserByAPIKey(ctx, key)
	if err != nil {
		return nil, bkerr.Unauthorized("invalid api key", err)
	}
	if user.Status != db.UserStatusActive {
		return nil, bkerr.Unauthorized("user is not active", nil)
	}

	roles, err := s.identity.ListUserRoles(ctx, user.ID)
	if err != nil {
		return nil, bkerr.Internal("failed to load user roles", err)
	}

	memberships, err := s.identity.ListUserWorkspaceMemberships(ctx, user.ID)
	if err != nil {
		return nil, bkerr.Internal("failed to load workspace memberships", err)
	}

	// Touch API key asynchronously
	go func() {
		apiKeyRow, err := s.apiKeys.GetAPIKeyByKey(context.Background(), key)
		if err == nil {
			_ = s.apiKeys.TouchAPIKey(context.Background(), apiKeyRow.ID)
		}
	}()

	principal := PrincipalFromDB(&db.AuthPrincipal{
		User:                 user,
		AuthSession:          &db.AuthSession{}, // zero-value marker — no session for API key auth
		Roles:                roles,
		WorkspaceMemberships: memberships,
	})
	return principal, nil
}

// ─── Profile / Settings methods (always local) ─────────────────────────────────

// UpdateUserProfile updates a user's profile fields. Always local: username/
// bio/avatar have no seshat-server equivalent (iam.User only has DisplayName).
func (s *Service) UpdateUserProfile(ctx context.Context, userID string, params ProfileUpdateParams) (*db.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	updated, err := s.identity.UpdateUserProfile(ctx, db.UpdateUserProfileParams{
		ID:          userID,
		DisplayName: params.DisplayName,
		Username:    params.Username,
		Bio:         params.Bio,
		AvatarURL:   params.AvatarURL,
	})
	if err != nil {
		return nil, bkerr.InvalidInput("failed to update profile", err)
	}
	return updated, nil
}

// UpdateUserSettings merges settings into a user's settings JSON. Always local.
func (s *Service) UpdateUserSettings(ctx context.Context, userID string, settings map[string]any) (*db.User, error) {
	if s == nil || s.identity == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	updated, err := s.identity.UpdateUserSettings(ctx, userID, settings)
	if err != nil {
		return nil, bkerr.Internal("failed to update settings", err)
	}
	return updated, nil
}
