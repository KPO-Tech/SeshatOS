package knowledgeagent

import (
	"reflect"
	"strings"
	"testing"
)

func TestDefinition(t *testing.T) {
	def := Definition()
	if def.AgentType != Slug || !IsKnowledge(def.AgentType) {
		t.Fatalf("the agent is known by its slug, got %q", def.AgentType)
	}
	if string(def.Source) != "built-in" {
		t.Fatalf("the agent is built into the product, got source %q", def.Source)
	}
	if !reflect.DeepEqual(def.Tools, []string{"knowledge_search", "knowledge_read"}) {
		t.Fatalf("the agent has these two tools, read only, and no other (never the runtime's Read, which takes any path), got %v", def.Tools)
	}
	for _, tool := range def.Tools {
		if strings.Contains(tool, "*") {
			t.Fatalf("a pattern would fail open: %q", tool)
		}
	}
	if def.GetSystemPrompt() != Prompt {
		t.Fatal("the agent follows its own prompt")
	}
}

func TestDefinitionIsACopyEachTime(t *testing.T) {
	first := Definition()
	first.Tools[0] = "bash"
	if got := Definition().Tools[0]; got != "knowledge_search" {
		t.Fatalf("changing one copy must not change the next, got %q", got)
	}
}

func TestIsKnowledge(t *testing.T) {
	if IsKnowledge("") || IsKnowledge("Knowledge") || IsKnowledge("knowledge-extra") {
		t.Fatal("only the exact slug is the Knowledge agent's")
	}
}
