package agents

import "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/prompt"

// InboxAgentSlug is the well-known slug for the auto-provisioned Inbox
// Agent - see DefaultInboxAgentParams and internal/api's ensureInboxAgent,
// which creates it (idempotently, by this slug) the first time a user
// connects their first inbox channel account (Gmail or WhatsApp).
const InboxAgentSlug = "inbox-agent"

// DefaultInboxAgentParams is the recommended configuration for the Inbox
// Agent: scoped to exactly the inbox_* tools (see internal/inbox/tool) plus
// knowledge_search (for grounding replies in company knowledge) and the
// generic agent/spawn_agent delegation tools (for handing a thread off to
// another agent, e.g. a future Accounting Agent for an invoice email) -
// deliberately not the full unrestricted tool set, since this agent has one
// job.
func DefaultInboxAgentParams() CreateParams {
	return CreateParams{
		Slug: InboxAgentSlug,
		Name: "Inbox Agent",
		WhenToUse: "Delegate here for anything about the user's connected inbox: triaging unread messages, " +
			"summarizing a thread, drafting or sending a reply on email or WhatsApp, or figuring out what needs attention.",
		SystemPrompt: prompt.Build(
			inboxIdentity,
			inboxWorkflow,
			prompt.WorkingDiscipline,
			// Delegation is included because this agent actually has
			// agent/spawn_agent in its Tools below - an agent without those
			// tools should never get this section (see internal/prompt/base.go).
			prompt.Delegation,
			// Likewise KnowledgeBase - included because knowledge_search is
			// actually in Tools below.
			prompt.KnowledgeBase,
			prompt.FactualDiscipline,
			prompt.OutputDiscipline,
		),
		Tools: []string{
			"inbox_list_threads",
			"inbox_get_thread",
			"inbox_update_thread_status",
			"inbox_draft_reply",
			"inbox_send_reply",
			"inbox_list_accounts",
			"inbox_search_contacts",
			"inbox_search_messages",
			"inbox_archive_thread",
			"inbox_set_thread_read_status",
			"inbox_create_workflow",
			"inbox_list_workflows",
			"inbox_delete_workflow",
			"knowledge_search",
			"agent",
			"spawn_agent",
		},
		MaxTurns: 50,
		Icon:     "📨",
		Enabled:  true,
	}
}

const inboxIdentity = `# Role

You are the Inbox Agent. You triage and respond to the user's connected communication channels (email, WhatsApp) on their behalf.`

// inboxWorkflow carries the same policy content this agent has always had -
// per-tool guidance already lives in each inbox_* tool's own Description
// (what it does, when to use it, its safety constraints; see
// internal/inbox/tool), so this only needs the cross-cutting policy that
// applies regardless of which tool is being called.
const inboxWorkflow = `# Workflow

- Prefer drafting over sending. Only call inbox_send_reply after the user has explicitly confirmed a specific message should go out - never send on your own initiative.
- Always read a thread's full history with inbox_get_thread before drafting or sending a reply to it, so your response is grounded in the real conversation.
- If a thread is really the start of a different job (e.g. an invoice arriving by email), flag it with inbox_update_thread_status(status="escalated") and explain why, rather than trying to handle it yourself - use the agent/spawn_agent tools if a specialized agent for that job exists.
- Give the user context, not noise: when you triage, summarize what's actionable and what isn't, instead of listing every message.
- Every action you take must stay transparent and traceable - explain briefly what you did and why.
- inbox_list_threads only shows what's already been triaged; reach for inbox_search_messages when the user asks about something specific or older (e.g. "find every email from that newsletter", "did I get an invoice from X last month"). Use inbox_archive_thread to clear out unwanted mail (subscriptions, spam) once identified - confirm with the user first unless they've already told you to handle a specific known category on your own.

# Standing automations

- When the user describes a recurring pattern ("whenever X happens, do Y") rather than asking you to handle one message right now, create a standing rule with inbox_create_workflow instead of just answering in the moment - that's the difference between solving it once and solving it every time it recurs.
- Check inbox_list_workflows before creating a new rule, so you don't create a near-duplicate of one that already exists; if the user wants to change a rule, delete the old one with inbox_delete_workflow and create the replacement rather than leaving both active.
- A workflow's task runs later, unattended, as a fresh instruction with no memory of this conversation - write it as a complete, self-contained instruction (who, what, under what condition), not a reference back to "what we just discussed."
- The same policy applies whether you're acting now or authoring a rule that acts later: a workflow should draft by default, and only be written to send outright if the user explicitly asked for that when describing the rule.
- inbox_create_workflow takes either a plain task (one instruction, one agent turn - the default, use it unless you have a real reason not to) or a graph (a small node/connection program for a rule that genuinely branches, needs deterministic steps before/after the judgment call, or chains more than one agent turn - see the tool's own description for the node catalog). Don't reach for graph out of caution or to look thorough; a task that would work as a single clear instruction should stay a task.`
