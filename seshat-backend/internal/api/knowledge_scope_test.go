package api

import (
	"context"
	"testing"

	backendknowledge "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
)

func TestWithKnowledgeScope(t *testing.T) {
	ctx := context.Background()

	if got := backendknowledge.ScopeFromContext(withKnowledgeScope(ctx, "knowledge", " legal ")); got != "legal" {
		t.Fatalf("the Knowledge agent is limited to the chosen collection, got %q", got)
	}
	if got := backendknowledge.ScopeFromContext(withKnowledgeScope(ctx, "knowledge", "")); got != "" {
		t.Fatalf("without a choice there is no limit, got %q", got)
	}
	for _, slug := range []string{"", "inbox-agent", "Knowledge"} {
		if got := backendknowledge.ScopeFromContext(withKnowledgeScope(ctx, slug, "legal")); got != "" {
			t.Fatalf("agent %q keeps its own use of corpus_id, got a scope %q", slug, got)
		}
	}
}
