package query

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

func makeWorkspace(t *testing.T, root, name string, age time.Duration) string {
	t.Helper()
	dir := filepath.Join(root, name)
	if err := os.MkdirAll(filepath.Join(dir, "plans"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "plans", "plan.md"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	when := time.Now().Add(-age)
	if err := os.Chtimes(dir, when, when); err != nil {
		t.Fatal(err)
	}
	return dir
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func TestSweepOrphanWorkspaces(t *testing.T) {
	database := openSweepTestDB(t)
	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ownershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}
	ctx := context.Background()
	hash, err := db.HashPassword("test-password-secure")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	user, err := identityStore.CreateUser(ctx, db.CreateUserParams{
		Email: "orphans@example.com", DisplayName: "Orphans", PasswordHash: hash, Status: db.UserStatusActive,
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if _, err := ownershipStore.Create(ctx, db.CreateSessionOwnershipParams{SessionID: "owned", UserID: user.ID}); err != nil {
		t.Fatalf("Create ownership: %v", err)
	}

	root := t.TempDir()
	old := 48 * time.Hour
	owned := makeWorkspace(t, root, "owned", old)
	inSDK := makeWorkspace(t, root, "in-sdk-store", old)
	orphan := makeWorkspace(t, root, "orphan", old)
	recent := makeWorkspace(t, root, "recent-orphan", time.Minute)
	stray := filepath.Join(root, "stray.txt")
	if err := os.WriteFile(stray, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	files := &sweepStubFilesProvider{}
	svc := NewService(ServiceConfig{
		Sessions: &sweepStubSessionManager{sessions: []*sdk.SessionInfo{
			{ID: sdk.SessionID("in-sdk-store"), TotalTurns: 1, CreatedAt: time.Now().Add(-old).Unix()},
		}},
		Ownership: ownershipStore,
		Files:     files,
	})

	n, err := svc.SweepOrphanWorkspaces(ctx, root, 24*time.Hour)
	if err != nil {
		t.Fatalf("SweepOrphanWorkspaces: %v", err)
	}
	if n != 1 {
		t.Fatalf("removed %d directories, want 1", n)
	}
	if exists(orphan) {
		t.Error("a directory that no session points at should be removed")
	}
	if !files.deletedForSession["orphan"] {
		t.Error("the file records of an orphan directory should be removed with it")
	}
	for name, dir := range map[string]string{"owned by a user": owned, "known to the SDK": inSDK, "too recent": recent} {
		if !exists(dir) {
			t.Errorf("a directory %s must be kept", name)
		}
	}
	if !exists(stray) {
		t.Error("a file is not a session directory and must be left alone")
	}
}

func TestSweepOrphanWorkspacesMissingRootIsNotAnError(t *testing.T) {
	svc := NewService(ServiceConfig{Sessions: &sweepStubSessionManager{}})
	n, err := svc.SweepOrphanWorkspaces(context.Background(), filepath.Join(t.TempDir(), "absent"), time.Hour)
	if err != nil || n != 0 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}
