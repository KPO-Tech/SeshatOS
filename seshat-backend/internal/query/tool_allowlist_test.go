package query

import (
	"context"
	"reflect"
	"testing"

	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat-runtime/pkg/agent"
)

func TestToolAllowlistFromPatterns(t *testing.T) {
	cases := []struct {
		name         string
		patterns     []string
		wantAllowed  []string
		wantRestrict bool
	}{
		{"bare star means unrestricted", []string{"*"}, nil, false},
		{"empty means unrestricted", nil, nil, false},
		{"exact names restrict", []string{"inbox_list_threads", "inbox_get_thread"}, []string{"inbox_list_threads", "inbox_get_thread"}, true},
		{"a glob beyond bare star fails open", []string{"inbox_*"}, nil, false},
		{"mixed exact and glob fails open entirely", []string{"inbox_list_threads", "inbox_*"}, nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, restrict := toolAllowlistFromPatterns(tc.patterns)
			if restrict != tc.wantRestrict {
				t.Fatalf("restrict = %v, want %v", restrict, tc.wantRestrict)
			}
			if !reflect.DeepEqual(allowed, tc.wantAllowed) {
				t.Fatalf("allowed = %v, want %v", allowed, tc.wantAllowed)
			}
		})
	}
}

// fakeAgentsProvider returns a fixed definition (or none) regardless of slug -
// enough to exercise BuildContextInput's tool-allowlist wiring without a real
// internal/agents.Service or database.
type fakeAgentsProvider struct {
	def *agent.AgentDefinition
}

func (f fakeAgentsProvider) GetDefinition(ctx context.Context, principal *backendauth.Principal, slug string) (*agent.AgentDefinition, bool) {
	if f.def == nil {
		return nil, false
	}
	return f.def, true
}

func TestBuildContextInput_PopulatesAllowedToolsFromAgentDefinition(t *testing.T) {
	svc := &Service{
		agents: fakeAgentsProvider{def: &agent.AgentDefinition{
			Tools: []string{"inbox_list_threads", "inbox_get_thread"},
		}},
	}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{
		Prompt:    "hello",
		AgentSlug: "inbox-agent",
	})
	want := []string{"inbox_list_threads", "inbox_get_thread"}
	if !reflect.DeepEqual(input.AllowedTools, want) {
		t.Fatalf("AllowedTools = %v, want %v", input.AllowedTools, want)
	}
}

func TestBuildContextInput_NoRestrictionWhenAgentToolsIsNil(t *testing.T) {
	svc := &Service{
		agents: fakeAgentsProvider{def: &agent.AgentDefinition{Tools: nil}},
	}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{
		Prompt:    "hello",
		AgentSlug: "some-unrestricted-agent",
	})
	if len(input.AllowedTools) != 0 {
		t.Fatalf("AllowedTools = %v, want empty (unrestricted)", input.AllowedTools)
	}
}

func TestBuildContextInput_NoAgentSlugMeansNoRestriction(t *testing.T) {
	svc := &Service{
		agents: fakeAgentsProvider{def: &agent.AgentDefinition{Tools: []string{"inbox_list_threads"}}},
	}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{
		Prompt: "hello",
		// AgentSlug intentionally empty - general chat must never be restricted.
	})
	if len(input.AllowedTools) != 0 {
		t.Fatalf("AllowedTools = %v, want empty when no agent_slug is set", input.AllowedTools)
	}
}

// Plain chat must let the runtime compose its own General Agent prompt. An
// override here would also discard the dynamic context (project instructions,
// git state, memory) the runtime builds around it, since its
// FetchSystemPromptParts returns early as soon as a custom prompt is set.
func TestBuildContextInput_NoAgentSlugLeavesTheRuntimePromptInCharge(t *testing.T) {
	svc := &Service{}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{
		Prompt: "hello",
	})
	if input.SystemPromptOverride != nil {
		t.Fatalf("expected no SystemPromptOverride for plain chat, got %q", *input.SystemPromptOverride)
	}

	// What the product does own still arrives, through the append.
	if input.AppendSystemPrompt == nil {
		t.Fatal("expected the product blocks to be appended")
	}
	for _, want := range []string{"Rich rendering available in this UI", "Where you are running", "Internal knowledge base"} {
		if !strings.Contains(*input.AppendSystemPrompt, want) {
			t.Fatalf("expected %q in the append, got %q", want, *input.AppendSystemPrompt)
		}
	}
}

// The knowledge-base block teaches knowledge_search, so an agent whose
// definition restricts its tools to a list without that tool must not be told
// about it.
func TestBuildContextInput_KnowledgeBaseBlockFollowsTheToolAllowlist(t *testing.T) {
	cases := []struct {
		name  string
		tools []string
		want  bool
	}{
		{"unrestricted agent is told about it", nil, true},
		{"allowlist including it keeps it", []string{"knowledge_search", "web_search"}, true},
		{"allowlist without it drops it", []string{"inbox_list_threads"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc := &Service{
				agents: fakeAgentsProvider{def: &agent.AgentDefinition{Tools: tc.tools}},
			}
			params := ContextBuildParams{Prompt: "hello"}
			if tc.tools != nil {
				params.AgentSlug = "some-agent"
			}
			input, _ := svc.BuildContextInput(context.Background(), params)
			if input.AppendSystemPrompt == nil {
				t.Fatal("expected the product blocks to be appended")
			}
			got := strings.Contains(*input.AppendSystemPrompt, "Internal knowledge base")
			if got != tc.want {
				t.Fatalf("knowledge-base block present = %v, want %v (append: %q)", got, tc.want, *input.AppendSystemPrompt)
			}
		})
	}
}

func TestBuildContextInput_AgentSystemPromptIsTheOverride(t *testing.T) {
	svc := &Service{
		agents: fakeAgentsProvider{def: &agent.AgentDefinition{
			GetSystemPrompt: func() string { return "you are a specialized agent" },
		}},
	}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{
		Prompt:    "hello",
		AgentSlug: "some-agent",
	})
	if input.SystemPromptOverride == nil || *input.SystemPromptOverride != "you are a specialized agent" {
		t.Fatalf("expected the agent's own system prompt to be the override, got %v", input.SystemPromptOverride)
	}
	if input.AppendSystemPrompt == nil || !strings.Contains(*input.AppendSystemPrompt, "Rich rendering available in this UI") {
		t.Fatal("expected the product blocks to be appended for a custom agent too")
	}
}
