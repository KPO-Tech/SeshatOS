package query

import (
	"context"
	"reflect"
	"strings"
	"testing"

	knowledgeagent "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/agent"
)

func TestBuildContextInput_KnowledgeAgentGetsOnlyItsOwnTools(t *testing.T) {
	svc := &Service{agents: fakeAgentsProvider{def: knowledgeagent.Definition()}}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{Prompt: "What is the notice period?", AgentSlug: knowledgeagent.Slug})

	if !reflect.DeepEqual(input.AllowedTools, []string{"knowledge_search"}) {
		t.Fatalf("the session must be narrowed to knowledge_search alone, got %v", input.AllowedTools)
	}
	if input.SystemPromptOverride == nil || *input.SystemPromptOverride != knowledgeagent.Prompt {
		t.Fatal("the agent's own prompt must replace the default identity")
	}
}

func TestBuildContextInput_KnowledgeAgentIsNotToldAboutToolsItDoesNotHave(t *testing.T) {
	svc := &Service{agents: fakeAgentsProvider{def: knowledgeagent.Definition()}}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{Prompt: "hello", AgentSlug: knowledgeagent.Slug})

	appended := ""
	if input.AppendSystemPrompt != nil {
		appended = *input.AppendSystemPrompt
	}
	// write_file is taught by the rendering block, "Narrate as you work" by the narration block, and the generic knowledge block asks
	// not to number its sources: none of them belongs to an agent whose prompt says otherwise.
	for _, unwanted := range []string{"write_file", "Narrate as you work", "Where you are running", "Internal knowledge base"} {
		if strings.Contains(appended, unwanted) {
			t.Errorf("the Knowledge agent must not be given %q, got:\n%s", unwanted, appended)
		}
	}

	// The same blocks are still given to every other agent.
	other, _ := (&Service{}).BuildContextInput(context.Background(), ContextBuildParams{Prompt: "hello"})
	if other.AppendSystemPrompt == nil || !strings.Contains(*other.AppendSystemPrompt, "Narrate as you work") {
		t.Fatal("the general agent keeps its blocks")
	}
}

func TestKnowledgeAgentPromptTeachesTheCitationFormatTheToolWrites(t *testing.T) {
	// The tool introduces each excerpt with "ref=" and the prompt tells the agent to cite that value: if one changes alone, citations break.
	for _, want := range []string{"ref=", "knowledge_search", "already restricted", "[k7f3a91]"} {
		if !strings.Contains(knowledgeagent.Prompt, want) {
			t.Errorf("the prompt must mention %q", want)
		}
	}
}

func TestBuildContextInput_KnowledgeAgentIsToldWhenTheQuestionIsLimitedToACollection(t *testing.T) {
	svc := &Service{agents: fakeAgentsProvider{def: knowledgeagent.Definition()}}

	limited, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{Prompt: "notice period", AgentSlug: knowledgeagent.Slug, CorpusID: "legal"})
	if limited.AppendSystemPrompt == nil || !strings.Contains(*limited.AppendSystemPrompt, "Scope of this question") {
		t.Fatal("an agent whose question is limited to a collection must be told what that means")
	}

	open, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{Prompt: "notice period", AgentSlug: knowledgeagent.Slug})
	if open.AppendSystemPrompt != nil && strings.Contains(*open.AppendSystemPrompt, "Scope of this question") {
		t.Fatal("a question over every collection must not carry the scope block")
	}

	// Another agent keeps its own use of corpus_id: no scope block.
	other, _ := (&Service{}).BuildContextInput(context.Background(), ContextBuildParams{Prompt: "hello", CorpusID: "legal"})
	if other.AppendSystemPrompt != nil && strings.Contains(*other.AppendSystemPrompt, "Scope of this question") {
		t.Fatal("only the Knowledge agent is given the scope block")
	}
}
