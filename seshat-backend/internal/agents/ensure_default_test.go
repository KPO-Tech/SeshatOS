package agents

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

// testFixtureAgentParams is a minimal, self-contained CreateParams used only
// to exercise EnsureDefault's idempotency, independent of any real
// provisioned agent.
func testFixtureAgentParams() CreateParams {
	return CreateParams{
		Slug:         "test-fixture-agent",
		Name:         "Test Fixture Agent",
		WhenToUse:    "Used only by ensure_default_test.go.",
		SystemPrompt: "You are a test fixture.",
		Enabled:      true,
	}
}

func TestEnsureDefault_CreatesOnceThenNoOps(t *testing.T) {
	database := openTestDB(t)
	store, err := db.NewAgentDefinitionStore(database)
	if err != nil {
		t.Fatalf("NewAgentDefinitionStore: %v", err)
	}
	svc := NewService(store, nil)
	ctx := context.Background()

	if err := svc.EnsureDefault(ctx, testFixtureAgentParams()); err != nil {
		t.Fatalf("EnsureDefault (first call): %v", err)
	}
	first, err := svc.GetBySlug(ctx, testFixtureAgentParams().Slug)
	if err != nil {
		t.Fatalf("GetBySlug after first EnsureDefault: %v", err)
	}

	if err := svc.EnsureDefault(ctx, testFixtureAgentParams()); err != nil {
		t.Fatalf("EnsureDefault (second call): %v", err)
	}
	second, err := svc.GetBySlug(ctx, testFixtureAgentParams().Slug)
	if err != nil {
		t.Fatalf("GetBySlug after second EnsureDefault: %v", err)
	}

	if first.ID != second.ID {
		t.Fatalf("expected EnsureDefault to be idempotent (same row), got %q then %q", first.ID, second.ID)
	}
}

func TestEnsureDefault_NilStoreIsANoOp(t *testing.T) {
	svc := NewService(nil, nil)
	if err := svc.EnsureDefault(context.Background(), testFixtureAgentParams()); err != nil {
		t.Fatalf("expected EnsureDefault on a nil-store service to be a safe no-op, got: %v", err)
	}
}
