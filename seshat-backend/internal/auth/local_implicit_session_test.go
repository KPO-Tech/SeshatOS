package auth

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func newTestLocalProvider(t *testing.T) *LocalProvider {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "implicit-session.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	return NewLocalProvider(identity, ServiceConfig{})
}

func TestEnsureImplicitSession_CreatesUnprivilegedUserOnce(t *testing.T) {
	provider := newTestLocalProvider(t)
	ctx := context.Background()

	first, err := provider.EnsureImplicitSession(ctx)
	if err != nil {
		t.Fatalf("EnsureImplicitSession (first call): %v", err)
	}
	if first.Token == "" {
		t.Error("expected a non-empty session token")
	}
	if first.User.Email != implicitLocalEmail {
		t.Errorf("expected user email %q, got %q", implicitLocalEmail, first.User.Email)
	}
	if len(first.Roles) != 0 {
		t.Errorf("expected the implicit local user to have no roles (not admin), got %v", first.Roles)
	}

	second, err := provider.EnsureImplicitSession(ctx)
	if err != nil {
		t.Fatalf("EnsureImplicitSession (second call): %v", err)
	}
	if first.User.ID != second.User.ID {
		t.Fatalf("expected the same underlying user across calls, got %q then %q", first.User.ID, second.User.ID)
	}
	if first.Token == second.Token {
		t.Error("expected a fresh session token on each call, not a reused one")
	}
}

func TestService_LocalImplicitSession_FailsForNonLocalProvider(t *testing.T) {
	svc := &Service{provider: fakeCloudProvider{}}
	if _, err := svc.LocalImplicitSession(context.Background()); err == nil {
		t.Fatal("expected LocalImplicitSession to fail when the active provider isn't LocalProvider (connected mode)")
	}
}

// fakeCloudProvider is a minimal Provider stand-in for connected mode -
// only used to prove LocalImplicitSession's type-assertion gate rejects
// any non-*LocalProvider, real implementation irrelevant.
type fakeCloudProvider struct{ Provider }
