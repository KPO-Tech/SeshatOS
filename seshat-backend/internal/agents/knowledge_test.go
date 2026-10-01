package agents

import (
	"strings"
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prompt"
)

func TestDefaultKnowledgeAgentParams_IsWellFormed(t *testing.T) {
	p := DefaultKnowledgeAgentParams()
	if p.Slug != KnowledgeAgentSlug {
		t.Errorf("expected slug %q, got %q", KnowledgeAgentSlug, p.Slug)
	}
	if !isValidSlug(p.Slug) {
		t.Errorf("slug %q is not a valid agent slug", p.Slug)
	}
	if p.SystemPrompt == "" {
		t.Error("expected a non-empty system prompt")
	}
	if !p.Enabled {
		t.Error("expected the default Knowledge Agent to be enabled")
	}
	if len(p.Tools) != 1 || p.Tools[0] != "knowledge_search" {
		t.Errorf("expected DefaultKnowledgeAgentParams to be scoped to exactly [knowledge_search], got %v", p.Tools)
	}
}

// TestDefaultKnowledgeAgentParams_PromptIsComposedCorrectly mirrors
// inbox_test.go's assertion: Knowledge has no agent/spawn_agent tool, so
// its composed prompt must NOT include prompt.Delegation - giving it that
// section would reference a tool it doesn't have.
func TestDefaultKnowledgeAgentParams_PromptIsComposedCorrectly(t *testing.T) {
	p := DefaultKnowledgeAgentParams()
	for _, marker := range []string{"# Role", "# Workflow", "Knowledge Agent"} {
		if !strings.Contains(p.SystemPrompt, marker) {
			t.Errorf("expected composed SystemPrompt to contain %q", marker)
		}
	}
	if strings.Contains(p.SystemPrompt, prompt.Delegation) {
		t.Error("expected Knowledge's SystemPrompt to NOT include prompt.Delegation (it has no agent/spawn_agent tool)")
	}
	// Knowledge does have knowledge_search in its Tools, but deliberately
	// does not compose prompt.KnowledgeBase - its own identity/workflow
	// already cover "search before answering, cite sources" in more depth,
	// so the generic section would be redundant, not wrong.
	if strings.Contains(p.SystemPrompt, prompt.KnowledgeBase) {
		t.Error("expected Knowledge's SystemPrompt to NOT include prompt.KnowledgeBase (redundant with its own identity)")
	}
	if !strings.Contains(p.SystemPrompt, prompt.WorkingDiscipline) {
		t.Error("expected Knowledge's SystemPrompt to include prompt.WorkingDiscipline")
	}
	if !strings.Contains(p.SystemPrompt, prompt.FactualDiscipline) {
		t.Error("expected Knowledge's SystemPrompt to include prompt.FactualDiscipline")
	}
}
