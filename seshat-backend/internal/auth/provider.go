package auth

import (
	"context"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// Organization is the identity-provider view of a tenant organization.
type Organization struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	OwnerUserID string `json:"owner_user_id"`
	Status      string `json:"status"`
}

type CreateUserParams struct {
	Email       string
	DisplayName string
	Password    string
	Status      string
	Roles       []string
}

type UpdateUserParams struct {
	DisplayName *string
	Password    *string
	Status      *string
	// Role, when set, replaces the target user's entire role set with this
	// single role (e.g. promote a member to admin, or the reverse). Not the
	// same as CreateUserParams.Roles, which only ever adds to an empty set.
	Role *string
}

type CreateOrganizationParams struct {
	Name string
	Slug string
}

type UpdateOrganizationParams struct {
	Name   *string
	Slug   *string
	Status *string
}

// Provider is the identity backend behind Service: seshat-backend's own local
// SQLite store in standalone mode (LocalProvider), or a remote seshat-server
// in connected mode (cloudidentity.Provider). Exactly one implementation is
// selected once at bootstrap based on config and never swapped at runtime —
// changing the identity source of truth while local sessions are active is a
// deployment decision, not a live toggle (see helps/seshat-architecture-target.md).
//
// Workspaces, API keys, user groups/permission-flags, and rich profile fields
// (username/bio/avatar) are intentionally NOT part of this interface: they
// have no seshat-server equivalent and always stay local regardless of mode
// (Service handles them directly against the identity store).
type Provider interface {
	Login(ctx context.Context, email, password string) (*LoginResult, error)
	Register(ctx context.Context, email, password, displayName string) (*LoginResult, error)
	Logout(ctx context.Context, principal *Principal) error
	ResolvePrincipal(ctx context.Context, token string) (*Principal, error)

	GetUserByID(ctx context.Context, principal *Principal, userID string) (*db.User, error)
	ListUsersPaginated(ctx context.Context, principal *Principal, params db.ListUsersParams) ([]db.User, int64, error)
	ListUsers(ctx context.Context, principal *Principal) ([]User, error)
	CreateUser(ctx context.Context, principal *Principal, params CreateUserParams) (*User, error)
	GetUser(ctx context.Context, principal *Principal, userID string) (*User, error)
	UpdateUser(ctx context.Context, principal *Principal, userID string, params UpdateUserParams) (*User, error)
	DeleteUser(ctx context.Context, principal *Principal, userID string) error
	// DisableSelf disables the calling principal's own account. Distinct
	// from UpdateUser (which is an admin-managing-someone-else operation
	// gated on EnsureAdmin) — self-service account deletion must work for
	// any authenticated user acting on themselves, admin or not.
	DisableSelf(ctx context.Context, principal *Principal) error

	ListOrganizations(ctx context.Context, principal *Principal) ([]Organization, error)
	CreateOrganization(ctx context.Context, principal *Principal, params CreateOrganizationParams) (*Organization, error)
	GetOrganization(ctx context.Context, principal *Principal, organizationID string) (*Organization, error)
	UpdateOrganization(ctx context.Context, principal *Principal, organizationID string, params UpdateOrganizationParams) (*Organization, error)
	DeleteOrganization(ctx context.Context, principal *Principal, organizationID string) error
}
