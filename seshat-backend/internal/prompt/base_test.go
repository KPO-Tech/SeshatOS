package prompt

import (
	"strings"
	"testing"
)

func TestBaseSections_NonEmptyAndStartWithExpectedHeading(t *testing.T) {
	cases := []struct {
		name    string
		value   string
		heading string
	}{
		{"WorkingDiscipline", WorkingDiscipline, "# Working discipline"},
		{"Delegation", Delegation, "# Delegation"},
		{"PlanMode", PlanMode, "# Plan mode"},
		{"TaskTracking", TaskTracking, "# Task tracking"},
		{"KnowledgeBase", KnowledgeBase, "# Internal knowledge base"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.value == "" {
				t.Fatal("expected a non-empty section")
			}
			if !strings.HasPrefix(tc.value, tc.heading) {
				t.Fatalf("expected %s to start with %q", tc.name, tc.heading)
			}
		})
	}
}

// TestBaseSections_DropCodingSpecificExamples guards against a future edit
// accidentally reintroducing the coding-specific examples these sections
// were deliberately trimmed of (see base.go's doc comment).
func TestBaseSections_DropCodingSpecificExamples(t *testing.T) {
	all := strings.Join([]string{WorkingDiscipline, Delegation, PlanMode, TaskTracking, KnowledgeBase}, "\n\n")
	forbidden := []string{"internal/auth", "edit_file", "write_file", "git push"}
	for _, phrase := range forbidden {
		if strings.Contains(all, phrase) {
			t.Errorf("base.go sections should not reference coding-specific example %q", phrase)
		}
	}
}

func TestKnowledgeBase_DoesNotRequestBracketedInlineCitations(t *testing.T) {
	forbidden := []string{"Cite sources inline", "bracketed numbers", "matching the tool's numbered results"}
	for _, phrase := range forbidden {
		if strings.Contains(KnowledgeBase, phrase) {
			t.Errorf("KnowledgeBase should not request raw inline numeric citations, found %q", phrase)
		}
	}
}

func TestBaseSections_AreDistinctFromCorePrompt(t *testing.T) {
	// Base sections are hand-adapted derivatives, not verbatim copies of
	// sections.go - they should not be byte-identical to any core section.
	base := []string{WorkingDiscipline, Delegation, PlanMode, TaskTracking, KnowledgeBase}
	core := []string{Identity, RuntimeContract, WorkingRules, FactualDiscipline, ToolUse, ToolPriority, Workflow, Modes, Orchestration, Browser, Examples, VerificationExamples, OutputDiscipline}
	for _, b := range base {
		for _, c := range core {
			if b == c {
				t.Errorf("expected base section to differ from sections.go content, found an identical match")
			}
		}
	}
}
