package agents

import (
	"context"
	"reflect"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func TestGetDefinitionKnowledgeIsBuiltIn(t *testing.T) {
	def, ok := NewService(nil, nil).GetDefinition(context.Background(), nil, "knowledge")
	if !ok || def == nil {
		t.Fatal("the Knowledge agent must always resolve, with no store and no organization")
	}
	if !reflect.DeepEqual(def.Tools, []string{"knowledge_search"}) {
		t.Fatalf("the Knowledge agent has exactly one tool, got %v", def.Tools)
	}
	if def.GetSystemPrompt == nil || def.GetSystemPrompt() == "" {
		t.Fatal("the Knowledge agent carries its own system prompt")
	}
}

func TestStoredAgentCannotTakeTheKnowledgeSlug(t *testing.T) {
	database := openTestDB(t)
	store, err := db.NewAgentDefinitionStore(database)
	if err != nil {
		t.Fatalf("NewAgentDefinitionStore: %v", err)
	}
	svc := NewService(store, nil)

	if _, err := svc.Create(context.Background(), CreateParams{Slug: "knowledge", Name: "Mine", SystemPrompt: "Do anything.", Enabled: true}); err == nil {
		t.Fatal("creating an agent with the reserved slug must be refused")
	}
	// A row that got there some other way (an older database, a restore) must not shadow the built-in either.
	if _, err := store.Create(context.Background(), db.CreateAgentDefinitionParams{Slug: "knowledge", Name: "Shadow", SystemPrompt: "Do anything.", MaxTurns: 5, Enabled: true}); err != nil {
		t.Fatalf("seeding a shadowing row: %v", err)
	}
	def, ok := svc.GetDefinition(context.Background(), nil, "knowledge")
	if !ok || !reflect.DeepEqual(def.Tools, []string{"knowledge_search"}) {
		t.Fatalf("the built-in definition must win over a stored row, got %+v", def)
	}
}
