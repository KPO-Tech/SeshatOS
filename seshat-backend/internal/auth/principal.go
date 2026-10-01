package auth

import (
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type User struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	DisplayName string   `json:"display_name"`
	Status      string   `json:"status"`
	Roles       []string `json:"roles,omitempty"`
}

type AuthSession struct {
	ID        string    `json:"id"`
	ExpiresAt time.Time `json:"expires_at"`
}

type WorkspaceMembership struct {
	WorkspaceID      string `json:"workspace_id"`
	WorkspaceSlug    string `json:"workspace_slug"`
	OrganizationID   string `json:"organization_id"`
	OrganizationSlug string `json:"organization_slug"`
	Role             string `json:"role"`
}

type LoginResult struct {
	Token     string
	ExpiresAt time.Time
	User      User
	Roles     []string
}

type Principal struct {
	User                 User                  `json:"user"`
	AuthSession          AuthSession           `json:"auth_session"`
	Roles                []string              `json:"roles"`
	WorkspaceMemberships []WorkspaceMembership `json:"workspace_memberships"`
	// ResolvedOrganizationID is the caller's organization in connected mode,
	// set directly by cloudidentity.principalFromMe from the seshat-server
	// login/me response. Deliberately independent of WorkspaceMemberships:
	// those list LOCAL workspaces only, and a freshly connected desktop
	// account starts with zero of them, so deriving the org solely from
	// WorkspaceMemberships[0] silently resolved to "" for every brand-new
	// account (before the user ever created a local workspace) - breaking
	// org-scoped provider/web-search/MCP/agents resolution from the very
	// first login. See OrganizationID().
	ResolvedOrganizationID string `json:"resolved_organization_id,omitempty"`
}

// OrganizationID returns the caller's organization: ResolvedOrganizationID
// if set (always the case in connected mode), else falls back to the first
// workspace membership's org for any caller constructed without going
// through principalFromMe. Returns "" if the caller has no organization at
// all (e.g. a platform super-admin, who never has one by design).
func (p *Principal) OrganizationID() string {
	if p == nil {
		return ""
	}
	if p.ResolvedOrganizationID != "" {
		return p.ResolvedOrganizationID
	}
	if len(p.WorkspaceMemberships) == 0 {
		return ""
	}
	return p.WorkspaceMemberships[0].OrganizationID
}

func (p *Principal) HasRole(roleName string) bool {
	if p == nil {
		return false
	}
	normalized := strings.TrimSpace(strings.ToLower(roleName))
	for _, role := range p.Roles {
		if strings.TrimSpace(strings.ToLower(role)) == normalized {
			return true
		}
	}
	return false
}

func (p *Principal) CanViewOrganization(organizationID string) bool {
	if p.HasRole("admin") || p.HasRole("owner") {
		return true
	}
	for _, m := range p.WorkspaceMemberships {
		if m.OrganizationID == organizationID {
			return true
		}
	}
	return false
}

func (p *Principal) CanViewWorkspace(workspaceID string) bool {
	if p.HasRole("admin") || p.HasRole("owner") {
		return true
	}
	for _, m := range p.WorkspaceMemberships {
		if m.WorkspaceID == workspaceID {
			return true
		}
	}
	return false
}

func PrincipalFromDB(principal *db.AuthPrincipal) *Principal {
	if principal == nil || principal.User == nil || principal.AuthSession == nil {
		return nil
	}
	out := &Principal{
		User: User{
			ID:          principal.User.ID,
			Email:       principal.User.Email,
			DisplayName: principal.User.DisplayName,
			Status:      principal.User.Status,
		},
		AuthSession: AuthSession{
			ID:        principal.AuthSession.ID,
			ExpiresAt: principal.AuthSession.ExpiresAt,
		},
		Roles:                make([]string, 0, len(principal.Roles)),
		WorkspaceMemberships: make([]WorkspaceMembership, 0, len(principal.WorkspaceMemberships)),
	}
	for _, role := range principal.Roles {
		out.Roles = append(out.Roles, role.Name)
	}
	for _, m := range principal.WorkspaceMemberships {
		out.WorkspaceMemberships = append(out.WorkspaceMemberships, WorkspaceMembership{
			WorkspaceID:      m.WorkspaceID,
			WorkspaceSlug:    m.WorkspaceSlug,
			OrganizationID:   m.OrganizationID,
			OrganizationSlug: m.OrganizationSlug,
			Role:             m.RoleName,
		})
	}
	return out
}

func EnsureAuthenticated(principal *Principal) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	return nil
}

func EnsureAdmin(principal *Principal) error {
	if err := EnsureAuthenticated(principal); err != nil {
		return err
	}
	if !principal.HasRole("admin") && !principal.HasRole("owner") {
		return bkerr.Forbidden(`role "admin" or "owner" required`, nil)
	}
	return nil
}
