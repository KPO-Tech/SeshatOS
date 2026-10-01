package cloudidentity

import (
	"context"
	"errors"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

var _ auth.Provider = (*Provider)(nil)

// Provider implements auth.Provider against a remote seshat-server — the
// "connected mode" identity backend. Unlike an earlier version of this
// type, the organization is NOT configured at pairing time: seshat-server
// enforces at most one organization per user account, so principalFromMe
// resolves it fresh from each login/me response instead — see
// auth.Principal.OrganizationID's doc comment for why that's both simpler
// and more correct than a fixed value (a fixed org ID silently produced the
// wrong role for anyone whose actual membership didn't match it).
type Provider struct {
	client *Client
	cache  *Cache
	// identity lists LOCAL workspaces only, to mirror the server-resolved org
	// role uniformly across them (workspaces have no seshat-server equivalent
	// — see auth.Workspace doc comment). Never used for anything else here.
	identity *db.IdentityStore
}

func NewProvider(serverURL string, cache *Cache, identity *db.IdentityStore) *Provider {
	return &Provider{
		client:   NewClient(serverURL),
		cache:    cache,
		identity: identity,
	}
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
// Errors are translated via cloudhttp.Translate (maps an *HTTPError's status
// code to the matching bkerr.Kind). Network failures (server unreachable)
// become bkerr.Unavailable there — callers that can tolerate staleness
// (ResolvePrincipal) handle those via the cache's grace window instead.

func (p *Provider) Login(ctx context.Context, email, password string) (*auth.LoginResult, error) {
	result, err := p.client.Login(ctx, email, password)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	// Login's response has no explicit session expiry; fetch it once via Me
	// so ExpiresAt (used by seshat-ui) is accurate rather than guessed.
	me, err := p.client.Me(ctx, result.Token)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	principal := p.principalFromMe(ctx, me, result.Token)
	_ = p.cache.Put(ctx, result.Token, principal)

	return &auth.LoginResult{
		Token:     result.Token,
		ExpiresAt: me.Session.ExpiresAt,
		User:      principal.User,
		Roles:     principal.Roles,
	}, nil
}

func (p *Provider) Logout(ctx context.Context, principal *auth.Principal) error {
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return err
	}
	token := principal.AuthSession.ID // see principalFromMe: AuthSession.ID carries the raw token in connected mode
	_ = p.cache.Delete(ctx, token)
	if err := p.client.Logout(ctx, token); err != nil {
		return cloudhttp.Translate(err)
	}
	return nil
}

// Register is always disabled in connected mode: seshat-server has no
// self-serve signup, only Bootstrap (first server user, once) and admin-created
// users (see helps/seshat-architecture-target.md §2c). Callers (seshat-ui's
// Register screen) treat any 403 here as "ask your organization administrator".
func (p *Provider) Register(ctx context.Context, email, password, displayName string) (*auth.LoginResult, error) {
	return nil, bkerr.Forbidden("self-registration is disabled for this organization; ask your administrator for an account", nil)
}

func (p *Provider) ResolvePrincipal(ctx context.Context, token string) (*auth.Principal, error) {
	if cached, age, found, cacheErr := p.cache.Get(ctx, token); cacheErr == nil && found && age < freshnessWindow {
		return cached, nil
	}

	me, err := p.client.Me(ctx, token)
	if err != nil {
		// Network unreachable (not an auth rejection): fall back to a stale
		// cache entry within the grace window rather than locking the user
		// out of local chat/tools during a real outage.
		var httpErr *cloudhttp.HTTPError
		if !errors.As(err, &httpErr) {
			if cached, age, found, cacheErr := p.cache.Get(ctx, token); cacheErr == nil && found && age < graceWindow {
				return cached, nil
			}
			return nil, bkerr.Unavailable("identity server unreachable", err)
		}
		return nil, cloudhttp.Translate(err)
	}

	principal := p.principalFromMe(ctx, me, token)
	_ = p.cache.Put(ctx, token, principal)
	return principal, nil
}

// principalFromMe builds an auth.Principal from a /auth/me response. The raw
// token is stashed in AuthSession.ID (there is no separate local session
// concept in connected mode — see Logout). WorkspaceMemberships are
// synthesized from LOCAL workspaces (never from the server) with the
// server-resolved org and role applied uniformly — see auth.Workspace doc
// comment.
//
// Organization and role both come straight from the caller's own single
// membership (me.Memberships[0]) - seshat-server enforces at most one per
// user account, so there is never a "which one" ambiguity to resolve.
// Falls back to role "member" / no organization only when the account
// genuinely has zero memberships (e.g. the platform super-admin itself,
// who holds none by design).
func (p *Provider) principalFromMe(ctx context.Context, me *meResponse, token string) *auth.Principal {
	role := "member"
	organizationID := ""
	if len(me.Memberships) > 0 {
		role = me.Memberships[0].Role
		organizationID = me.Memberships[0].OrganizationID
	}
	roles := []string{role}
	if me.User.IsAdmin {
		roles = append(roles, "admin")
	}

	principal := &auth.Principal{
		User: auth.User{
			ID:          me.User.ID,
			Email:       me.User.Email,
			DisplayName: me.User.DisplayName,
			Status:      "active",
		},
		AuthSession:            auth.AuthSession{ID: token, ExpiresAt: me.Session.ExpiresAt},
		Roles:                  roles,
		ResolvedOrganizationID: organizationID,
	}

	if p.identity != nil {
		if workspaces, err := p.identity.ListWorkspaces(ctx); err == nil {
			for _, ws := range workspaces {
				principal.WorkspaceMemberships = append(principal.WorkspaceMemberships, auth.WorkspaceMembership{
					WorkspaceID:      ws.ID,
					WorkspaceSlug:    ws.Slug,
					OrganizationID:   organizationID,
					OrganizationSlug: "",
					Role:             role,
				})
			}
		}
	}
	return principal
}

// ─── Users ────────────────────────────────────────────────────────────────────

// GetUserByID uses the resolved principal's own token — self-profile lookups
// only, since seshat-server requires a session token for every call.
func (p *Provider) GetUserByID(ctx context.Context, principal *auth.Principal, userID string) (*db.User, error) {
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	user, err := p.client.GetUser(ctx, principal.AuthSession.ID, userID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return &db.User{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Status:      "active",
	}, nil
}

func (p *Provider) ListUsersPaginated(ctx context.Context, principal *auth.Principal, params db.ListUsersParams) ([]db.User, int64, error) {
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, 0, err
	}
	offset := (params.Page - 1) * params.PerPage
	if offset < 0 {
		offset = 0
	}
	limit := params.PerPage
	if limit <= 0 {
		limit = 30
	}
	users, total, err := p.client.ListUsers(ctx, principal.AuthSession.ID, params.Search, limit, offset)
	if err != nil {
		return nil, 0, cloudhttp.Translate(err)
	}
	out := make([]db.User, 0, len(users))
	for _, u := range users {
		out = append(out, db.User{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName, Status: "active"})
	}
	return out, total, nil
}

func (p *Provider) ListUsers(ctx context.Context, principal *auth.Principal) ([]auth.User, error) {
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	users, _, err := p.client.ListUsers(ctx, principal.AuthSession.ID, "", 200, 0)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	out := make([]auth.User, 0, len(users))
	for _, u := range users {
		out = append(out, userFromRemote(u))
	}
	return out, nil
}

func (p *Provider) CreateUser(ctx context.Context, principal *auth.Principal, params auth.CreateUserParams) (*auth.User, error) {
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	role := "member"
	if len(params.Roles) > 0 {
		role = params.Roles[0]
	}
	user, err := p.client.CreateUser(ctx, principal.AuthSession.ID, principal.OrganizationID(), role, params.Email, params.Password, params.DisplayName)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := userFromRemote(*user)
	return &result, nil
}

func (p *Provider) GetUser(ctx context.Context, principal *auth.Principal, userID string) (*auth.User, error) {
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	user, err := p.client.GetUser(ctx, principal.AuthSession.ID, userID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := userFromRemote(*user)
	return &result, nil
}

func (p *Provider) UpdateUser(ctx context.Context, principal *auth.Principal, userID string, params auth.UpdateUserParams) (*auth.User, error) {
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	if params.Status != nil {
		return nil, bkerr.Forbidden("disabling accounts is not supported in connected mode; ask your organization administrator to remove the account", nil)
	}
	if params.Role != nil {
		return nil, bkerr.Forbidden("role changes are not supported here in connected mode; manage membership roles from the organization's control plane instead", nil)
	}
	user, err := p.client.UpdateUser(ctx, principal.AuthSession.ID, userID, nil, params.DisplayName)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := userFromRemote(*user)
	return &result, nil
}

// DisableSelf: seshat-server has no self-service "disable my own account"
// endpoint today (only admin-driven user management) — this is an honest,
// upfront error rather than the confusing failure that resulted from
// routing self-deletion through UpdateUser (which requires admin and then
// separately rejects any Status change).
func (p *Provider) DisableSelf(ctx context.Context, principal *auth.Principal) error {
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return err
	}
	return bkerr.Unavailable("self-service account deletion isn't available yet when connected to an organization server — ask your organization administrator to remove your account", nil)
}

func (p *Provider) DeleteUser(ctx context.Context, principal *auth.Principal, userID string) error {
	if err := auth.EnsureAdmin(principal); err != nil {
		return err
	}
	if err := p.client.DeleteUser(ctx, principal.AuthSession.ID, userID); err != nil {
		return cloudhttp.Translate(err)
	}
	return nil
}

// ─── Organizations ────────────────────────────────────────────────────────────

func (p *Provider) ListOrganizations(ctx context.Context, principal *auth.Principal) ([]auth.Organization, error) {
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	orgs, err := p.client.ListOrganizations(ctx, principal.AuthSession.ID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	out := make([]auth.Organization, 0, len(orgs))
	for _, org := range orgs {
		out = append(out, organizationFromRemote(org))
	}
	return out, nil
}

// CreateOrganization is not supported in connected mode: a connected backend
// belongs to exactly one, already-provisioned organization (see
// helps/seshat-architecture-target.md §1 — organizations are managed via
// Seshat Console, not from a paired backend).
func (p *Provider) CreateOrganization(ctx context.Context, principal *auth.Principal, params auth.CreateOrganizationParams) (*auth.Organization, error) {
	return nil, bkerr.Forbidden("organizations are managed via Seshat Console in connected mode", nil)
}

func (p *Provider) GetOrganization(ctx context.Context, principal *auth.Principal, organizationID string) (*auth.Organization, error) {
	if err := auth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	org, err := p.client.GetOrganization(ctx, principal.AuthSession.ID, organizationID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := organizationFromRemote(*org)
	return &result, nil
}

func (p *Provider) UpdateOrganization(ctx context.Context, principal *auth.Principal, organizationID string, params auth.UpdateOrganizationParams) (*auth.Organization, error) {
	if err := auth.EnsureAdmin(principal); err != nil {
		return nil, err
	}
	org, err := p.client.UpdateOrganization(ctx, principal.AuthSession.ID, organizationID, params.Name, params.Slug)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	result := organizationFromRemote(*org)
	return &result, nil
}

// DeleteOrganization is not supported in connected mode — same reasoning as
// CreateOrganization.
func (p *Provider) DeleteOrganization(ctx context.Context, principal *auth.Principal, organizationID string) error {
	return bkerr.Forbidden("organizations are managed via Seshat Console in connected mode", nil)
}

// ─── converters ───────────────────────────────────────────────────────────────

func userFromRemote(u User) auth.User {
	return auth.User{
		ID:          u.ID,
		Email:       u.Email,
		DisplayName: u.DisplayName,
		Status:      "active",
	}
}

func organizationFromRemote(o Organization) auth.Organization {
	return auth.Organization{
		ID:     o.ID,
		Name:   o.Name,
		Slug:   o.Slug,
		Status: "active",
	}
}
