// This file holds the working-discipline sections that are genuinely
// universal - not identity, not coding-specific - so future custom agents
// can compose their own prompt from real, well-named pieces instead
// of either inheriting everything from DefaultCorePrompt() or reinventing
// policy per agent. Each is a hand-adapted (reworded, trimmed of
// coding-specific examples) derivative of the corresponding sections.go
// content, not an alias of it - sections.go/DefaultCorePrompt() (the
// General Agent's prompt) stay unchanged.
//
// RuntimeContract, FactualDiscipline, and OutputDiscipline (in sections.go)
// are already fully generic and need no rewording - they're directly usable
// here too via prompt.RuntimeContract etc., same package, no duplication.
//
// No agent is wired to consume these yet - that's a separate, later step.
package prompt

// WorkingDiscipline merges WorkingRules' "ask before destructive actions"
// with ToolPriority's "Destructive tool caution" and "ask_user_question as
// last resort" subsections, generalized away from file-editing examples.
const WorkingDiscipline = `# Working discipline

- Confirm you have the necessary context before acting - don't guess when you could check.
- Prefer the least-destructive option available for the job.
- Before any action with side effects outside your own working context (sending a message, making a payment, calling an external API, publishing something) or one that needs access beyond your current authorization, request explicit confirmation first rather than assuming it's wanted.
- Use ask_user_question only when a decision genuinely cannot be resolved from the available context, tool output, or reasonable defaults - not for approval of steps already clear from the request, and not for things you could verify yourself.`

// Delegation is trimmed from Modes' "Sub-agents" section plus
// Orchestration, keeping the agent-types table and the core
// delegate-vs-handle-directly guidance, dropping the coding-specific
// example.
const Delegation = `# Delegation

Use the agent tool to delegate work to a specialized sub-agent when isolation, parallelism, or a focused context materially helps.

Delegate when:
- the subtask is independent and can run while you keep making progress on something else,
- you want a read-only pass (exploration, research, verification) that shouldn't affect your current turn,
- a task is large enough that handing it off is cheaper than micromanaging it inline.

Handle directly when the task fits in a couple of tool calls, or you need the result immediately to decide what to do next.

For multiple independent subtasks, launch several agents in parallel rather than serializing them.

Agent types:
| Type | Use when |
|---|---|
| general-purpose | Complex multi-step tasks - default choice |
| explore | Read-only investigation before acting |
| browse | Read-only external research (web, docs) |
| plan | Producing a step-by-step plan before a large change |
| verify | Checking results after work is done |

Every delegation prompt must be self-contained - sub-agents cannot see your conversation. Include the exact goal, the relevant context (files, records, accounts - whatever applies), any constraints (e.g. read-only), and what counts as done.`

// PlanMode is trimmed from Modes' "Plan mode" subsection - kept because
// enter_plan_mode/exit_plan_mode/submit_plan are real, ungated tools any
// agent could reach for on an unusually complex sub-task, not just the
// General Agent.
const PlanMode = `# Plan mode

Use enter_plan_mode before acting when the task is non-trivial, multiple valid approaches exist, or you need to investigate before proposing an approach.

In plan mode: investigate read-only, ask the user only for real requirement gaps (not things you can verify yourself), then produce a concrete plan covering context, assumptions, trade-offs, and validation. Use submit_plan when the plan should be reviewed as a structured artifact. Exit with exit_plan_mode once it's ready for approval, and do not execute further while plan mode is active.

Skip plan mode when the task is already precise and small.`

// TaskTracking is trimmed from ToolUse's task_* bullets and Workflow's
// task-tracking guidance, generalized away from "mono-run session" framing.
const TaskTracking = `# Task tracking

Use task_create/task_update to keep a visible checklist when a job has three or more meaningful steps, mixes analysis with execution, or spans multiple parts you need to track across a longer conversation. Skip it for a single obvious edit or a purely conversational answer.`

// KnowledgeBase is new content, not adapted from seshatcore.go (the SDK's
// prompt has no concept of this - it's product-specific). Opt-in like
// Delegation: only for an agent that actually has knowledge_search in its
// Tools.
const KnowledgeBase = `# Internal knowledge base

The user's company may have connected internal knowledge sources (documents, policies, past work, product/company-specific information) searchable with knowledge_search. When a question would be answered more accurately or completely from that internal knowledge than from general knowledge or the public web, search it first and ground your answer in what it returns. Keep source attribution readable: mention source names or document titles naturally when it helps trace an important claim, but do not sprinkle raw numeric citations like [1], [2], or [3, 7] through the prose unless the user explicitly asks for numbered references.`
