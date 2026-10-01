package query

import (
	"context"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/sdk"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// stubTool is the minimal sdk.Tool implementation needed to register a
// handful of named, otherwise-inert tools on a real session for
// applyToolAllowlist to prune.
type stubTool struct {
	name string
}

func (t stubTool) Definition() tools.Definition {
	return tools.Definition{Name: t.name, Description: "stub", InputSchema: tools.FromMap(map[string]any{"type": "object"})}
}
func (t stubTool) Call(_ context.Context, _ tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	return tools.NewTextResult(""), nil
}
func (t stubTool) Description(_ context.Context) (string, error) { return "stub", nil }
func (t stubTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t stubTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t stubTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t stubTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t stubTool) IsEnabled() bool                         { return true }
func (t stubTool) FormatResult(data any) string            { return "" }
func (t stubTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

func newTestSessionWithTools(t *testing.T, names ...string) *sdk.Session {
	t.Helper()
	runtime := newTestSDKRuntime(t)
	session, err := runtime.client.CreateSession(context.Background())
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	for _, name := range names {
		if err := session.RegisterTool(stubTool{name: name}); err != nil {
			t.Fatalf("RegisterTool(%s): %v", name, err)
		}
	}
	return session
}

func toolNameSet(names []string) map[string]bool {
	set := make(map[string]bool, len(names))
	for _, n := range names {
		set[n] = true
	}
	return set
}

func TestApplyToolAllowlist_PrunesToAllowedSet(t *testing.T) {
	session := newTestSessionWithTools(t, "tool_a", "tool_b", "tool_c")

	applyToolAllowlist(session, []string{"tool_b"})

	got := toolNameSet(session.GetToolNames())
	if !got["tool_b"] {
		t.Fatal("expected tool_b to remain registered")
	}
	if got["tool_a"] || got["tool_c"] {
		t.Fatalf("expected only tool_b to remain, got %v", session.GetToolNames())
	}
}

func TestApplyToolAllowlist_EmptyAllowlistIsANoOp(t *testing.T) {
	session := newTestSessionWithTools(t, "tool_a", "tool_b")
	before := toolNameSet(session.GetToolNames())

	applyToolAllowlist(session, nil)

	after := toolNameSet(session.GetToolNames())
	if len(after) != len(before) {
		t.Fatalf("expected an empty allowlist to leave tools untouched, before=%v after=%v", before, after)
	}
}

func TestApplyToolAllowlist_RepeatedCallIsSafe(t *testing.T) {
	session := newTestSessionWithTools(t, "tool_a", "tool_b", "tool_c")

	applyToolAllowlist(session, []string{"tool_b"})
	applyToolAllowlist(session, []string{"tool_b"}) // must not error or change anything further

	got := session.GetToolNames()
	if len(got) != 1 || got[0] != "tool_b" {
		t.Fatalf("expected exactly [tool_b] after two idempotent calls, got %v", got)
	}
}
