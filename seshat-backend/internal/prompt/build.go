package prompt

import "strings"

// Build joins non-empty sections with a blank line - the same join
// convention seshatcore.go's own SeshatCoreStablePrompt() uses, so a
// composed prompt reads identically regardless of which sections are
// included. Lets a future agent compose only the sections relevant to it
// (e.g. skipping Browser for an agent with no browser tools) instead of
// always getting the full DefaultCorePrompt().
func Build(sections ...string) string {
	parts := make([]string, 0, len(sections))
	for _, s := range sections {
		if s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, "\n\n")
}

// DefaultCorePrompt is the General Agent's full prompt - the 13 sections
// verbatim-copied from seshatcore.go, in the same order as its own
// stableSystemPromptSections, plus KnowledgeBase (product-specific, not
// from the SDK - the General Agent always has knowledge_search, so it
// should know to reach for it; see base.go's doc comment on KnowledgeBase).
// This is the direct replacement for depending on the SDK's own default:
// seshat-backend now owns this content and can adapt it for the product
// over time.
func DefaultCorePrompt() string {
	return Build(
		Identity, RuntimeContract, WorkingRules, FactualDiscipline,
		ToolUse, ToolPriority, KnowledgeBase, Workflow, Modes, Orchestration,
		Browser, Examples, VerificationExamples, OutputDiscipline,
	)
}
