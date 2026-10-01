package agents

import (
	"context"
	"testing"
	"time"
)

// ─── nil store guards ─────────────────────────────────────────────────────────

func TestNilStoreReturnsUnavailable(t *testing.T) {
	svc := NewService(nil, nil)
	ctx := context.Background()

	check := func(name string, err error) {
		t.Helper()
		if err == nil || err.Error() != "agent store not available" {
			t.Errorf("%s: expected unavailable error, got %v", name, err)
		}
	}

	_, err := svc.List(ctx)
	check("List", err)

	_, err = svc.GetBySlug(ctx, "x")
	check("GetBySlug", err)

	_, err = svc.GetByID(ctx, "x")
	check("GetByID", err)

	_, err = svc.Create(ctx, CreateParams{Slug: "x", Enabled: true})
	check("Create", err)

	_, err = svc.Update(ctx, "x", UpdateParams{})
	check("Update", err)

	check("Delete", svc.Delete(ctx, "x"))
}

// ─── isValidSlug ──────────────────────────────────────────────────────────────

func TestIsValidSlug(t *testing.T) {
	valid := []string{
		"my-agent",
		"code-reviewer",
		"agent42",
		"a",
		"abc-123-def",
	}
	for _, s := range valid {
		if !isValidSlug(s) {
			t.Errorf("expected %q to be valid", s)
		}
	}

	invalid := []string{
		"",
		"My-Agent", // uppercase
		"my agent", // space
		"my_agent", // underscore
		"my.agent", // dot
		"AGENT",    // all uppercase
		"agent!",   // special char
		"αgent",    // non-ASCII
	}
	for _, s := range invalid {
		if isValidSlug(s) {
			t.Errorf("expected %q to be invalid", s)
		}
	}
}

func TestIsValidSlugMaxLength(t *testing.T) {
	long := make([]byte, 65)
	for i := range long {
		long[i] = 'a'
	}
	if isValidSlug(string(long)) {
		t.Error("expected slug longer than 64 chars to be invalid")
	}
	exactly64 := string(long[:64])
	if !isValidSlug(exactly64) {
		t.Error("expected 64-char slug to be valid")
	}
}

// ─── GetDefinition fallback ───────────────────────────────────────────────────

func TestGetDefinitionFallsBackToBuiltIn(t *testing.T) {
	svc := NewService(nil, nil) // nil store → DB lookup skipped
	def, ok := svc.GetDefinition(context.Background(), nil, "general-purpose")
	if !ok {
		t.Fatal("expected built-in 'general-purpose' to be found")
	}
	if def == nil {
		t.Fatal("expected non-nil AgentDefinition")
	}
	if def.AgentType != "general-purpose" {
		t.Errorf("expected AgentType=general-purpose, got %q", def.AgentType)
	}
}

func TestGetDefinitionUnknownSlugReturnsFalse(t *testing.T) {
	svc := NewService(nil, nil)
	def, ok := svc.GetDefinition(context.Background(), nil, "completely-unknown-agent-xyz")
	if ok || def != nil {
		t.Error("expected (nil, false) for unknown slug")
	}
}

func TestGetDefinitionEmptySlugReturnsFalse(t *testing.T) {
	svc := NewService(nil, nil)
	def, ok := svc.GetDefinition(context.Background(), nil, "")
	if ok || def != nil {
		t.Error("expected (nil, false) for empty slug")
	}
}

// ─── toSDKDefinition ─────────────────────────────────────────────────────────

func TestToSDKDefinitionFieldMapping(t *testing.T) {
	a := Agent{
		Slug:            "my-reviewer",
		WhenToUse:       "Use for code reviews",
		SystemPrompt:    "You are a strict code reviewer.",
		Model:           "claude-opus-4-8",
		Tools:           []string{"read_file", "glob"},
		DisallowedTools: []string{"bash"},
		MaxTurns:        10,
		PermissionMode:  "never",
		Isolation:       "worktree",
		McpServers:      []string{"github"},
		Source:          "user",
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	def := toSDKDefinition(a)

	if def.AgentType != a.Slug {
		t.Errorf("AgentType: want %q, got %q", a.Slug, def.AgentType)
	}
	if def.WhenToUse != a.WhenToUse {
		t.Errorf("WhenToUse: want %q, got %q", a.WhenToUse, def.WhenToUse)
	}
	if def.Model != a.Model {
		t.Errorf("Model: want %q, got %q", a.Model, def.Model)
	}
	if string(def.PermissionMode) != a.PermissionMode {
		t.Errorf("PermissionMode: want %q, got %q", a.PermissionMode, def.PermissionMode)
	}
	if def.Isolation != a.Isolation {
		t.Errorf("Isolation: want %q, got %q", a.Isolation, def.Isolation)
	}
	if len(def.Tools) != len(a.Tools) || def.Tools[0] != a.Tools[0] {
		t.Errorf("Tools: want %v, got %v", a.Tools, def.Tools)
	}
	if len(def.DisallowedTools) != 1 || def.DisallowedTools[0] != "bash" {
		t.Errorf("DisallowedTools: want [bash], got %v", def.DisallowedTools)
	}
	if len(def.McpServers) != 1 || def.McpServers[0] != "github" {
		t.Errorf("McpServers: want [github], got %v", def.McpServers)
	}
	if def.MaxTurns != a.MaxTurns {
		t.Errorf("MaxTurns: want %d, got %d", a.MaxTurns, def.MaxTurns)
	}
	if def.GetSystemPrompt == nil {
		t.Fatal("GetSystemPrompt is nil")
	}
	if got := def.GetSystemPrompt(); got != a.SystemPrompt {
		t.Errorf("GetSystemPrompt(): want %q, got %q", a.SystemPrompt, got)
	}
}

func TestToSDKDefinitionEmptyPromptReturnsEmpty(t *testing.T) {
	def := toSDKDefinition(Agent{Slug: "empty", SystemPrompt: ""})
	if def.GetSystemPrompt == nil {
		t.Fatal("GetSystemPrompt is nil")
	}
	if got := def.GetSystemPrompt(); got != "" {
		t.Errorf("expected empty prompt, got %q", got)
	}
}
