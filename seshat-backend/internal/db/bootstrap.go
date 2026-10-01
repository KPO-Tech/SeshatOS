package db

import (
	"context"
	"fmt"
	"strings"
)

type BootstrapOptions struct {
	AdminEmail           string
	AdminDisplayName     string
	AdminPassword        string
	AdminPasswordHash    string
	DefaultOrgName       string
	DefaultOrgSlug       string
	DefaultWorkspaceName string
	DefaultWorkspaceSlug string
}

type BootstrapResult struct {
	AdminUser    *User
	Organization *Organization
	Workspace    *Workspace
}

func (s *IdentityStore) EnsureBootstrap(ctx context.Context, opts BootstrapOptions) (*BootstrapResult, error) {
	adminEmail := strings.TrimSpace(strings.ToLower(opts.AdminEmail))
	if adminEmail == "" {
		return nil, fmt.Errorf("admin email is required")
	}
	orgName := strings.TrimSpace(opts.DefaultOrgName)
	if orgName == "" {
		orgName = "Default Organization"
	}
	workspaceName := strings.TrimSpace(opts.DefaultWorkspaceName)
	if workspaceName == "" {
		workspaceName = "Main Workspace"
	}

	passwordHash := strings.TrimSpace(opts.AdminPasswordHash)
	if passwordHash == "" && strings.TrimSpace(opts.AdminPassword) != "" {
		hashed, err := HashPassword(opts.AdminPassword)
		if err != nil {
			return nil, err
		}
		passwordHash = hashed
	}

	user, err := s.GetUserByEmail(ctx, adminEmail)
	if err != nil {
		if err.Error() != "user not found" {
			return nil, err
		}
		user, err = s.CreateUser(ctx, CreateUserParams{
			Email:        adminEmail,
			DisplayName:  fallbackString(opts.AdminDisplayName, "Administrator"),
			PasswordHash: passwordHash,
			Status:       UserStatusActive,
			Metadata: map[string]any{
				"bootstrap_admin": true,
			},
		})
		if err != nil {
			return nil, err
		}
	}

	if err := s.AssignRoleToUser(ctx, user.ID, "admin"); err != nil {
		return nil, err
	}

	org, err := s.GetOrganizationBySlug(ctx, fallbackString(opts.DefaultOrgSlug, orgName))
	if err != nil {
		if err.Error() != "organization not found" {
			return nil, err
		}
		org, err = s.CreateOrganization(ctx, CreateOrganizationParams{
			Name:        orgName,
			Slug:        opts.DefaultOrgSlug,
			OwnerUserID: user.ID,
			Status:      OrganizationStatusActive,
			Metadata: map[string]any{
				"bootstrap_default": true,
			},
		})
		if err != nil {
			return nil, err
		}
	}

	workspace, err := s.GetWorkspaceBySlug(ctx, org.ID, fallbackString(opts.DefaultWorkspaceSlug, workspaceName))
	if err != nil {
		if err.Error() != "workspace not found" {
			return nil, err
		}
		workspace, err = s.CreateWorkspace(ctx, CreateWorkspaceParams{
			OrganizationID: org.ID,
			Name:           workspaceName,
			Slug:           opts.DefaultWorkspaceSlug,
			Status:         WorkspaceStatusActive,
			Metadata: map[string]any{
				"bootstrap_default": true,
			},
		})
		if err != nil {
			return nil, err
		}
	}

	if err := s.AddWorkspaceMember(ctx, workspace.ID, user.ID, "admin"); err != nil {
		return nil, err
	}

	return &BootstrapResult{
		AdminUser:    user,
		Organization: org,
		Workspace:    workspace,
	}, nil
}

func fallbackString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
