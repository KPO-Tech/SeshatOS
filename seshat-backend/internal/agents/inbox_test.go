package agents

import (
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/prompt"
)

func TestDefaultInboxAgentParams_IsWellFormed(t *testing.T) {
	p := DefaultInboxAgentParams()
	if p.Slug != InboxAgentSlug {
		t.Errorf("expected slug %q, got %q", InboxAgentSlug, p.Slug)
	}
	if !isValidSlug(p.Slug) {
		t.Errorf("slug %q is not a valid agent slug", p.Slug)
	}
	if p.SystemPrompt == "" {
		t.Error("expected a non-empty system prompt")
	}
	if !p.Enabled {
		t.Error("expected the default Inbox Agent to be enabled")
	}
	wantTools := map[string]bool{
		"inbox_list_threads":         false,
		"inbox_get_thread":           false,
		"inbox_update_thread_status": false,
		"inbox_draft_reply":          false,
		"inbox_send_reply":           false,
		"inbox_list_accounts":        false,
		"inbox_search_contacts":      false,
	}
	for _, tool := range p.Tools {
		if _, ok := wantTools[tool]; ok {
			wantTools[tool] = true
		}
	}
	for tool, found := range wantTools {
		if !found {
			t.Errorf("expected DefaultInboxAgentParams to include tool %q", tool)
		}
	}
}

// TestDefaultInboxAgentParams_PromptIsComposedCorrectly guards the one
// behavior that actually matters about the internal/prompt composition:
// Inbox has agent/spawn_agent in its Tools, so it must get the Delegation
// section - an agent without those tools must never get it (see
// knowledge_test.go's mirror assertion).
func TestDefaultInboxAgentParams_PromptIsComposedCorrectly(t *testing.T) {
	p := DefaultInboxAgentParams()
	for _, marker := range []string{"# Role", "# Workflow", "Inbox Agent"} {
		if !strings.Contains(p.SystemPrompt, marker) {
			t.Errorf("expected composed SystemPrompt to contain %q", marker)
		}
	}
	if !strings.Contains(p.SystemPrompt, prompt.Delegation) {
		t.Error("expected Inbox's SystemPrompt to include prompt.Delegation (it has agent/spawn_agent tools)")
	}
	if !strings.Contains(p.SystemPrompt, prompt.KnowledgeBase) {
		t.Error("expected Inbox's SystemPrompt to include prompt.KnowledgeBase (it has knowledge_search)")
	}
	if !strings.Contains(p.SystemPrompt, prompt.WorkingDiscipline) {
		t.Error("expected Inbox's SystemPrompt to include prompt.WorkingDiscipline")
	}
	if !strings.Contains(p.SystemPrompt, prompt.FactualDiscipline) {
		t.Error("expected Inbox's SystemPrompt to include prompt.FactualDiscipline")
	}
}
