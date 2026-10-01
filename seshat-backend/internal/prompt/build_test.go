package prompt

import (
	"strings"
	"testing"
)

func TestBuild_JoinsNonEmptySectionsAndSkipsEmpty(t *testing.T) {
	got := Build("first", "", "second", "", "third")
	want := "first\n\nsecond\n\nthird"
	if got != want {
		t.Fatalf("Build() = %q, want %q", got, want)
	}
}

func TestBuild_EmptyInputReturnsEmptyString(t *testing.T) {
	if got := Build(); got != "" {
		t.Fatalf("Build() = %q, want empty string", got)
	}
	if got := Build("", ""); got != "" {
		t.Fatalf("Build(\"\", \"\") = %q, want empty string", got)
	}
}

// TestDefaultCorePrompt_ContainsEverySectionOnce is a smoke test, not an
// exact-wording assertion - wording is expected to change once step 2
// (product adaptation) happens. It just guards against a section going
// missing or getting duplicated during a future edit.
func TestDefaultCorePrompt_ContainsEverySectionOnce(t *testing.T) {
	got := DefaultCorePrompt()
	markers := map[string]string{
		"Identity":             "# Role",
		"RuntimeContract":      "# Runtime contract",
		"WorkingRules":         "# Working rules",
		"FactualDiscipline":    "# Factual discipline",
		"ToolUse":              "# Tool use",
		"ToolPriority":         "# Tool priority",
		"KnowledgeBase":        "# Internal knowledge base",
		"Workflow":             "# Mono-run workflow",
		"Modes":                "# Modes and delegation",
		"Orchestration":        "# Orchestration",
		"Browser":              "# Browser use",
		"Examples":             "# Workflow examples",
		"VerificationExamples": "# Verification examples",
		"OutputDiscipline":     "# Output discipline",
	}
	for section, marker := range markers {
		count := strings.Count(got, marker)
		if count != 1 {
			t.Errorf("expected marker %q (section %s) to appear exactly once, found %d", marker, section, count)
		}
	}
}

func TestDefaultCorePrompt_SectionsAppearInDeclaredOrder(t *testing.T) {
	got := DefaultCorePrompt()
	order := []string{
		"# Role", "# Runtime contract", "# Working rules", "# Factual discipline",
		"# Tool use", "# Tool priority", "# Internal knowledge base", "# Mono-run workflow", "# Modes and delegation",
		"# Orchestration", "# Browser use", "# Workflow examples", "# Verification examples",
		"# Output discipline",
	}
	lastIdx := -1
	for _, marker := range order {
		idx := strings.Index(got, marker)
		if idx == -1 {
			t.Fatalf("marker %q not found in DefaultCorePrompt()", marker)
		}
		if idx <= lastIdx {
			t.Fatalf("marker %q appears out of order (at %d, expected after %d)", marker, idx, lastIdx)
		}
		lastIdx = idx
	}
}
