package auth

import (
	"context"
	"path/filepath"
	"testing"

	automation "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/automation"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func newWorkspacePolicyTestService(t *testing.T, policies *automation.PolicyStore) (*Service, *Principal) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "workspaces.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	service := NewService(nil, identity, nil, ServiceConfig{}, policies)
	admin := &Principal{
		User:        User{ID: "usr_admin", Email: "admin@example.com"},
		AuthSession: AuthSession{ID: "tok"},
		Roles:       []string{"admin"},
	}
	return service, admin
}

func TestCreateWorkspaceAllowsMultipleByDefault(t *testing.T) {
	service, admin := newWorkspacePolicyTestService(t, nil)
	ctx := context.Background()

	if _, err := service.CreateWorkspace(ctx, admin, CreateWorkspaceParams{OrganizationID: "org_test", Name: "First", Slug: "first"}); err != nil {
		t.Fatalf("create first workspace: %v", err)
	}
	if _, err := service.CreateWorkspace(ctx, admin, CreateWorkspaceParams{OrganizationID: "org_test", Name: "Second", Slug: "second"}); err != nil {
		t.Fatalf("expected a second workspace to be allowed without a wired PolicyStore, got: %v", err)
	}
}

func TestCreateWorkspaceAllowsFirstWhenRestricted(t *testing.T) {
	policies := newTestPolicyStoreForWorkspace(t)
	if err := policies.Save(context.Background(), map[string]bool{automation.DesktopPolicyAllowMultipleWorkspaces: false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	service, admin := newWorkspacePolicyTestService(t, policies)

	if _, err := service.CreateWorkspace(context.Background(), admin, CreateWorkspaceParams{OrganizationID: "org_test", Name: "First", Slug: "first"}); err != nil {
		t.Fatalf("expected the very first workspace to always be allowed, got: %v", err)
	}
}

func TestCreateWorkspaceBlocksSecondWhenRestricted(t *testing.T) {
	policies := newTestPolicyStoreForWorkspace(t)
	if err := policies.Save(context.Background(), map[string]bool{automation.DesktopPolicyAllowMultipleWorkspaces: false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	service, admin := newWorkspacePolicyTestService(t, policies)
	ctx := context.Background()

	if _, err := service.CreateWorkspace(ctx, admin, CreateWorkspaceParams{OrganizationID: "org_test", Name: "First", Slug: "first"}); err != nil {
		t.Fatalf("create first workspace: %v", err)
	}
	if _, err := service.CreateWorkspace(ctx, admin, CreateWorkspaceParams{OrganizationID: "org_test", Name: "Second", Slug: "second"}); err == nil {
		t.Fatal("expected a second workspace to be rejected when allow_multiple_workspaces is false")
	}
}

func TestCreateWorkspaceAllowsWhenNeverSynced(t *testing.T) {
	policies := newTestPolicyStoreForWorkspace(t)
	service, admin := newWorkspacePolicyTestService(t, policies)
	ctx := context.Background()

	if _, err := service.CreateWorkspace(ctx, admin, CreateWorkspaceParams{OrganizationID: "org_test", Name: "First", Slug: "first"}); err != nil {
		t.Fatalf("create first workspace: %v", err)
	}
	if _, err := service.CreateWorkspace(ctx, admin, CreateWorkspaceParams{OrganizationID: "org_test", Name: "Second", Slug: "second"}); err != nil {
		t.Fatalf("expected fail-open (allowed) before any policy bundle has synced, got: %v", err)
	}
}

func newTestPolicyStoreForWorkspace(t *testing.T) *automation.PolicyStore {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "policies.db")))
	if err != nil {
		t.Fatalf("open policy test db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return automation.NewPolicyStore(database)
}
