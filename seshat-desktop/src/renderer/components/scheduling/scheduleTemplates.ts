import type { WebhookMethod } from '@renderer/components/config/automation/automationTypes'

// Ready-to-use scheduled tasks, so a first-time user can see and start from a
// real, populated task instead of writing one from scratch. A template is just
// a trigger plus a prompt: it opens the regular "New scheduled task" form
// pre-filled, so nothing is created until the user reviews and saves it.
export type ScheduleTemplate = {
  id: string
  name: string
  category: string
  description: string
  trigger_type: 'cron' | 'webhook'
  cron_expr?: string
  webhook_method?: WebhookMethod
  prompt: string
}

// Several of these are directly inspired by @openhands/extensions'
// automation catalog (MIT, github.com/OpenHands/extensions) - genuinely
// well-written, professionally scoped examples worth learning from - but
// rewritten for Seshat's simpler model: a Scheduling job is one prompt on
// one trigger, not OpenHands' integration-gated multi-step setup wizard
// (repo pickers, required MCP connections, etc.), so instructions that
// assumed a specific integration (GitHub label events, a repo clone, a
// named Slack/Linear/Notion MCP) are generalized to "use whatever
// tools/knowledge this agent has" instead of naming a specific connector
// Seshat has no equivalent setup step for yet.
export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  {
    id: 'weekly-ops-report',
    name: 'Weekly operations report',
    category: 'Reporting',
    description: 'Every Monday morning, compile a summary of the week ahead and anything that needs attention.',
    trigger_type: 'cron',
    cron_expr: '0 8 * * 1',
    prompt: 'You are running a weekly operations report.\n\nCompile a summary covering: open tasks and their status, anything overdue, notable changes since last week, and blockers that need a decision. Keep it scannable - short sections, no filler. Flag anything urgent at the top. End with a one-line "nothing needs attention" note if that is genuinely the case.',
  },
  {
    id: 'invoice-triage',
    name: 'Invoice triage',
    category: 'Finance',
    description: 'Every weekday morning, check for new invoices, extract the key fields, and flag anything unusual before it reaches someone\'s desk.',
    trigger_type: 'cron',
    cron_expr: '0 8 * * 1-5',
    prompt: 'You are running a scheduled invoice triage job.\n\nCheck for any new invoices received since the last run. For each one, extract: supplier, amount, currency, due date, and invoice number. Flag anything unusual: a supplier not seen before, an amount significantly above that supplier\'s typical range, a due date that has already passed, or a duplicate invoice number. Summarize what needs human review at the top, then list every invoice processed with its extracted fields.',
  },
  {
    id: 'daily-failure-monitor',
    name: 'Daily failure monitor',
    category: 'Reliability',
    description: 'Once a day, look across recent activity for failures or errors and summarize anything that looks urgent.',
    trigger_type: 'cron',
    cron_expr: '0 9 * * *',
    prompt: 'You are running a daily failure monitor.\n\nReview activity from the last 24 hours and identify anything that failed, errored, or needs attention: failed runs, error logs, missed deadlines, or anomalies. Group findings by severity (urgent / worth a look / informational). If nothing needs attention, say so plainly in one line rather than padding the report.',
  },
  {
    id: 'pr-review-digest',
    name: 'PR review digest',
    category: 'Code review',
    description: 'On weekday mornings, review open pull requests and flag the ones that need a careful, human look.',
    trigger_type: 'cron',
    cron_expr: '0 9 * * 1-5',
    prompt: 'You are running a pull request review digest.\n\nReview pull requests opened or updated since the last run. For each one, summarize what it changes, and flag anything risky: touches a critical path, lacks tests for the behavior it changes, is unusually large for its stated purpose, or looks auto-generated without review. Note who each one is currently waiting on. Group the result into "needs a careful review" and "routine," so a human reviewer knows where to spend their attention first, and give a one-line reason for every PR placed in the first group.',
  },
  {
    id: 'team-standup-digest',
    name: 'Team standup digest',
    category: 'Team updates',
    description: 'Summarize recent team activity into an async standup note with shipped work, blockers, decisions, and owners.',
    trigger_type: 'cron',
    cron_expr: '0 8 * * 1-5',
    prompt: 'You are running an async standup digest.\n\nReview team activity since the last digest and cluster it into four sections: shipped work, work in progress, blockers, and decisions made. For each item, name the owner and link to the relevant source when you can. Call out any question that is still waiting on an answer. Keep each section to a few lines - this replaces a live standup, so it should read faster than one, not slower.',
  },
  {
    id: 'document-freshness-check',
    name: 'Document freshness check',
    category: 'Knowledge',
    description: 'Every Monday, review key documentation for anything that looks stale, contradictory, or missing an owner.',
    trigger_type: 'cron',
    cron_expr: '0 9 * * 1',
    prompt: 'You are running a document freshness check.\n\nReview the organization\'s key documentation and flag: pages that look outdated (references to processes, tools, or dates that no longer apply), contradictions between documents covering the same topic, and important topics that appear to have no clear owner or documentation at all. Produce a short prioritized list of what should be updated first, with a one-sentence reason for each.',
  },
  {
    id: 'research-brief',
    name: 'Research brief writer',
    category: 'Research',
    description: 'Monitor a topic, gather sources, and publish a short brief with an executive summary and recommended actions.',
    trigger_type: 'cron',
    cron_expr: '0 8 * * 1',
    prompt: 'You are running a research brief job.\n\nResearch developments on the configured topic since the last run. Search for and read multiple sources, deduplicate overlapping coverage, and prefer recent, authoritative sources over stale or low-quality ones. Write a short brief: an executive summary, what it implies for us specifically, and recommended next actions - each claim backed by a cited source. If nothing meaningfully new happened since last time, say so instead of stretching thin coverage into a full brief.',
  },
  {
    id: 'issue-triage-assistant',
    name: 'Issue triage assistant',
    category: 'Project management',
    description: 'Classify new issues or tickets, suggest labels and priority, and flag likely duplicates.',
    trigger_type: 'cron',
    cron_expr: '*/30 * * * *',
    prompt: 'You are running an issue triage assistant.\n\nReview issues or tickets created since the last run. For each one, classify it (bug, feature request, support question, or chore), assess priority based on its content and any stated impact, and check whether it looks like a duplicate of an existing open issue. Write a short triage note per item with your reasoning, and suggest labels and an owner where the content makes one obvious. Do not close, merge, or reassign anything yourself - flag it for a human to action.',
  },
  {
    id: 'incident-webhook-summary',
    name: 'Incident webhook summary',
    category: 'Reliability',
    description: 'Fires whenever an external system posts an incident webhook - summarizes it and assesses severity immediately.',
    trigger_type: 'webhook',
    webhook_method: 'POST',
    prompt: 'You are running an incident webhook handler.\n\nA webhook payload has arrived describing an incident. Read it, summarize what happened in plain language, assess severity (critical / high / medium / low) based on its content, and note what should happen next (who to notify, whether it needs immediate escalation). If the payload is incomplete or unclear, say what information is missing rather than guessing.',
  },
]

export type ScheduleDraft = {
  name: string
  prompt: string
  trigger_type: 'cron' | 'webhook'
  cron_expr?: string
  webhook_method?: WebhookMethod
}

export function templateToDraft(template: ScheduleTemplate): ScheduleDraft {
  return {
    name: template.name,
    prompt: template.prompt,
    trigger_type: template.trigger_type,
    cron_expr: template.cron_expr,
    webhook_method: template.webhook_method
  }
}
