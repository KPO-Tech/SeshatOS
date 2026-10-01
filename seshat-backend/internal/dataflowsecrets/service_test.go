package dataflowsecrets

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return New(database)
}

func TestSetAndResolveRoundTrip(t *testing.T) {
	svc := newTestService(t)
	if err := svc.Set(context.Background(), "primary-db", "postgres://user:pass@host/db"); err != nil {
		t.Fatalf("set: %v", err)
	}
	got, err := svc.Resolve(context.Background(), "primary-db")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != "postgres://user:pass@host/db" {
		t.Fatalf("unexpected value: %q", got)
	}
}

func TestSetOverwritesExistingValue(t *testing.T) {
	svc := newTestService(t)
	if err := svc.Set(context.Background(), "k", "v1"); err != nil {
		t.Fatalf("set v1: %v", err)
	}
	if err := svc.Set(context.Background(), "k", "v2"); err != nil {
		t.Fatalf("set v2: %v", err)
	}
	got, err := svc.Resolve(context.Background(), "k")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != "v2" {
		t.Fatalf("expected overwritten value v2, got %q", got)
	}
}

func TestListReturnsOnlyDataflowSecretNames(t *testing.T) {
	svc := newTestService(t)
	if err := svc.Set(context.Background(), "a", "va"); err != nil {
		t.Fatalf("set a: %v", err)
	}
	if err := svc.Set(context.Background(), "b", "vb"); err != nil {
		t.Fatalf("set b: %v", err)
	}
	// An unrelated credential stored directly (simulating another feature
	// using the same shared store) must never leak into this package's List.
	if err := svc.db.UpsertCredential(context.Background(), "some-other-feature-key", "x"); err != nil {
		t.Fatalf("set unrelated credential: %v", err)
	}
	names, err := svc.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(names) != 2 {
		t.Fatalf("expected 2 names, got %v", names)
	}
}

func TestDeleteRemovesSecret(t *testing.T) {
	svc := newTestService(t)
	if err := svc.Set(context.Background(), "temp", "v"); err != nil {
		t.Fatalf("set: %v", err)
	}
	if err := svc.Delete(context.Background(), "temp"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := svc.Resolve(context.Background(), "temp"); err == nil {
		t.Fatal("expected resolve to fail after delete")
	}
}

func TestResolveFailsForUnknownName(t *testing.T) {
	svc := newTestService(t)
	if _, err := svc.Resolve(context.Background(), "does-not-exist"); err == nil {
		t.Fatal("expected error for unknown secret name")
	}
}

func TestSetValidatesRequiredFields(t *testing.T) {
	svc := newTestService(t)
	if err := svc.Set(context.Background(), "", "v"); err == nil {
		t.Fatal("expected error for empty name")
	}
	if err := svc.Set(context.Background(), "n", ""); err == nil {
		t.Fatal("expected error for empty value")
	}
}
