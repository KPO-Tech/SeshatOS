package agents

import "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/prompt"

// KnowledgeAgentSlug is the well-known slug for the auto-provisioned
// Knowledge Agent - see DefaultKnowledgeAgentParams and
// internal/config/bootstrap.go, which provisions it once at startup
// (idempotently, by this slug) since, unlike the Inbox Agent, there's no
// "first connection" event to hook into - the knowledge base is always
// available.
const KnowledgeAgentSlug = "knowledge-agent"

// DefaultKnowledgeAgentParams is the recommended configuration for the
// Knowledge Agent: scoped to exactly knowledge_search, nothing else. This
// formalizes behavior that already existed as a per-request prompt wrapper
// in seshat-ui's Knowledge search page (buildAgentInstruction) into a real
// agent identity with actual tool scoping, rather than a prompt-level
// convention the model could in principle ignore.
func DefaultKnowledgeAgentParams() CreateParams {
	return CreateParams{
		Slug: KnowledgeAgentSlug,
		Name: "Knowledge Agent",
		WhenToUse: "Delegate here for anything answerable from the user's connected knowledge base/corpora: " +
			"answering a question, summarizing what's known about a topic, or checking whether something is documented.",
		SystemPrompt: prompt.Build(
			knowledgeIdentity,
			knowledgeWorkflow,
			prompt.WorkingDiscipline,
			// No prompt.Delegation - this agent has no agent/spawn_agent
			// tool (see Tools below), deliberately staying narrow. See
			// internal/prompt/base.go's doc comment on why Delegation is
			// opt-in, not automatic.
			prompt.FactualDiscipline,
			prompt.OutputDiscipline,
		),
		Tools:    []string{"knowledge_search"},
		MaxTurns: 10,
		Icon:     "📚",
		Enabled:  true,
	}
}

const knowledgeIdentity = `# Role

You are the Knowledge Agent. You answer questions using only the user's connected knowledge base/corpora - never from your own training knowledge or assumptions.`

// knowledgeWorkflow mirrors the exact grounding/citation contract the
// Knowledge search page has always asked for per-request (see seshat-ui's
// buildAgentInstruction) - restated here as a standing identity instead of
// a one-off prompt wrapper.
const knowledgeWorkflow = `# Workflow

- Always search with knowledge_search before answering - never answer from memory alone.
- Ground every claim in what the tool actually returned. If the knowledge base has nothing relevant, say so plainly rather than guessing or filling gaps with general knowledge.
- Keep source attribution readable: mention source names or document titles naturally when it helps trace an important claim, but do not sprinkle raw numeric citations like [1], [2], or [3, 7] through the prose unless the user explicitly asks for numbered references.
- Keep answers focused on what was asked - don't pad with unrelated information the search happened to surface.`
