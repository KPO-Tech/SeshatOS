package config

import (
	"context"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
	"slices"
	"testing"

	knowledgeTools "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/tool"
)

func TestDesktopAgentKeepsTheApplicationsOwnToolLoaded(t *testing.T) {
	if !slices.Contains(desktopMainAgentTools(), knowledgeTools.ToolName) {
		t.Fatalf("%s is registered by this application and must be loaded for the main agent, or the agent never sees it", knowledgeTools.ToolName)
	}
}

func TestDesktopAgentToolListsAreDistinctAndCoreToolsAreLoaded(t *testing.T) {
	loaded, deferred := desktopMainAgentTools(), desktopMainAgentDeferredTools()
	for _, name := range deferred {
		if slices.Contains(loaded, name) {
			t.Errorf("%q is both loaded and deferred", name)
		}
	}
	for _, core := range []string{"read_file", "edit_file", "bash", "tool_search", "skill", "agent", "ask_user_question"} {
		if !slices.Contains(loaded, core) {
			t.Errorf("%q must be loaded: the agent cannot work, or cannot find the rest, without it", core)
		}
	}
	seen := map[string]bool{}
	for _, name := range loaded {
		if seen[name] {
			t.Errorf("%q is listed twice", name)
		}
		seen[name] = true
	}
}

// TestDesktopAgentSurfaceHoldsOnlyTheLoadedTools builds a real client with the profile and looks at what a new session
// offers the model: the loaded tools, tool_search to find the rest, and none of the deferred ones. The skill tool is
// flagged deferred by the runtime, so it is found with tool_search too.
func TestDesktopAgentSurfaceHoldsOnlyTheLoadedTools(t *testing.T) {
	client, err := sdk.NewClient(&sdk.ClientConfig{
		PersistSessions:        false,
		MainAgentTools:         desktopMainAgentTools(),
		MainAgentDeferredTools: desktopMainAgentDeferredTools(),
		EnableToolSearch:       true,
	})
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	session, err := client.CreateSession(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	offered := session.GetToolNames()

	for _, want := range []string{"read_file", "bash", "tool_search", "browser_open", "enter_worktree"} {
		if !slices.Contains(offered, want) {
			t.Errorf("%q should be offered to the model, got %v", want, offered)
		}
	}
	for _, hidden := range []string{"git_status", "calculator", "schedule_job", "browser_wait", "generate_image", "memory_search_nodes"} {
		if slices.Contains(offered, hidden) {
			t.Errorf("%q is deferred: it must be found with tool_search, not offered at every request", hidden)
		}
	}
	if len(offered) > len(desktopMainAgentTools()) {
		t.Errorf("the model is offered %d tools, more than the %d loaded ones", len(offered), len(desktopMainAgentTools()))
	}
}
