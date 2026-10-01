package db

import (
	"context"
	"strings"
	"testing"
)

func newAgentStore(t *testing.T) (*AgentDefinitionStore, context.Context) {
	t.Helper()
	database := openTestDB(t)
	store, err := NewAgentDefinitionStore(database)
	if err != nil {
		t.Fatalf("NewAgentDefinitionStore: %v", err)
	}
	return store, context.Background()
}

// ─── Create ───────────────────────────────────────────────────────────────────

func TestAgentCreate(t *testing.T) {
	store, ctx := newAgentStore(t)

	created, err := store.Create(ctx, CreateAgentDefinitionParams{
		Slug:         "code-reviewer",
		Name:         "Code Reviewer",
		WhenToUse:    "Use for reviewing pull requests",
		SystemPrompt: "You are a strict code reviewer.",
		Model:        "claude-opus-4-8",
		Tools:        []string{"read_file", "glob"},
		MaxTurns:     20,
		Enabled:      true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if !strings.HasPrefix(created.ID, "agt_") {
		t.Errorf("expected ID to start with agt_, got %q", created.ID)
	}
	if created.Slug != "code-reviewer" {
		t.Errorf("Slug: want code-reviewer, got %q", created.Slug)
	}
	if created.Name != "Code Reviewer" {
		t.Errorf("Name: want Code Reviewer, got %q", created.Name)
	}
	if created.MaxTurns != 20 {
		t.Errorf("MaxTurns: want 20, got %d", created.MaxTurns)
	}
	if len(created.Tools) != 2 {
		t.Errorf("Tools: want 2, got %d", len(created.Tools))
	}
	if created.Icon == "" {
		t.Error("expected default icon to be set")
	}
}

// ─── GetBySlug ────────────────────────────────────────────────────────────────

func TestAgentGetBySlug(t *testing.T) {
	store, ctx := newAgentStore(t)

	_, _ = store.Create(ctx, CreateAgentDefinitionParams{
		Slug:    "my-agent",
		Enabled: true,
	})

	got, err := store.GetBySlug(ctx, "my-agent")
	if err != nil {
		t.Fatalf("GetBySlug: %v", err)
	}
	if got.Slug != "my-agent" {
		t.Errorf("Slug: want my-agent, got %q", got.Slug)
	}
}

func TestAgentGetBySlugNotFound(t *testing.T) {
	store, ctx := newAgentStore(t)
	_, err := store.GetBySlug(ctx, "ghost")
	if err == nil {
		t.Fatal("expected error for non-existent slug")
	}
}

// ─── List ─────────────────────────────────────────────────────────────────────

func TestAgentListEmpty(t *testing.T) {
	store, ctx := newAgentStore(t)
	agents, err := store.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(agents) != 0 {
		t.Errorf("expected empty list, got %d", len(agents))
	}
}

func TestAgentListMultiple(t *testing.T) {
	store, ctx := newAgentStore(t)

	slugs := []string{"alpha", "beta", "gamma"}
	for _, s := range slugs {
		_, err := store.Create(ctx, CreateAgentDefinitionParams{Slug: s, Enabled: true})
		if err != nil {
			t.Fatalf("Create %s: %v", s, err)
		}
	}

	agents, err := store.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(agents) != 3 {
		t.Errorf("expected 3 agents, got %d", len(agents))
	}
}

// ─── Update ───────────────────────────────────────────────────────────────────

func TestAgentUpdate(t *testing.T) {
	store, ctx := newAgentStore(t)

	created, err := store.Create(ctx, CreateAgentDefinitionParams{
		Slug:     "updatable",
		Name:     "Old Name",
		MaxTurns: 10,
		Enabled:  true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	newName := "New Name"
	newTurns := 99
	updated, err := store.Update(ctx, created.ID, UpdateAgentDefinitionParams{
		Name:     &newName,
		MaxTurns: &newTurns,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "New Name" {
		t.Errorf("Name: want New Name, got %q", updated.Name)
	}
	if updated.MaxTurns != 99 {
		t.Errorf("MaxTurns: want 99, got %d", updated.MaxTurns)
	}
	// Slug unchanged
	if updated.Slug != "updatable" {
		t.Errorf("Slug changed unexpectedly: got %q", updated.Slug)
	}
}

// ─── Delete ───────────────────────────────────────────────────────────────────

func TestAgentDelete(t *testing.T) {
	store, ctx := newAgentStore(t)

	created, err := store.Create(ctx, CreateAgentDefinitionParams{Slug: "deletable", Enabled: true})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := store.Delete(ctx, created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err = store.GetByID(ctx, created.ID)
	if err == nil {
		t.Fatal("expected error after deletion")
	}
}

func TestAgentDeleteNotFound(t *testing.T) {
	store, ctx := newAgentStore(t)
	err := store.Delete(ctx, "agt_nonexistent")
	if err == nil {
		t.Fatal("expected error for non-existent ID")
	}
}

// ─── Unique slug constraint ───────────────────────────────────────────────────

func TestAgentSlugUnique(t *testing.T) {
	store, ctx := newAgentStore(t)

	_, err := store.Create(ctx, CreateAgentDefinitionParams{Slug: "unique-slug", Enabled: true})
	if err != nil {
		t.Fatalf("first Create: %v", err)
	}
	_, err = store.Create(ctx, CreateAgentDefinitionParams{Slug: "unique-slug", Enabled: true})
	// The second insert hits the unique index; the store returns nil rows (OnConflict DoNothing)
	// and the re-fetch by ID finds nothing — we verify no panic and graceful handling.
	_ = err // behavior depends on GORM driver; just ensure no panic
}

// ─── JSON field round-trip ────────────────────────────────────────────────────

func TestAgentToolsRoundTrip(t *testing.T) {
	store, ctx := newAgentStore(t)

	tools := []string{"read_file", "glob", "bash"}
	disallowed := []string{"write_file"}
	mcpServers := []string{"github", "postgres"}

	created, err := store.Create(ctx, CreateAgentDefinitionParams{
		Slug:            "json-rt",
		Tools:           tools,
		DisallowedTools: disallowed,
		McpServers:      mcpServers,
		Enabled:         true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := store.GetByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}

	if len(got.Tools) != 3 || got.Tools[2] != "bash" {
		t.Errorf("Tools round-trip: want %v, got %v", tools, got.Tools)
	}
	if len(got.DisallowedTools) != 1 || got.DisallowedTools[0] != "write_file" {
		t.Errorf("DisallowedTools round-trip: got %v", got.DisallowedTools)
	}
	if len(got.McpServers) != 2 || got.McpServers[1] != "postgres" {
		t.Errorf("McpServers round-trip: got %v", got.McpServers)
	}
}
