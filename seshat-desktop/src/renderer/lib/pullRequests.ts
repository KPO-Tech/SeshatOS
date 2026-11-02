// The pull requests the agent of a session opened, and how the Changes card words them.

export type PullState = 'open' | 'draft' | 'merged' | 'closed'
export type PullChecks = 'passing' | 'failing' | 'pending' | 'none' | 'unknown'

export type PullRequest = {
  owner: string
  repo: string
  number: number
  title: string
  url: string
  state: PullState
  additions: number
  deletions: number
  checks: PullChecks
  // GitHub's mergeable_state: clean, blocked, behind, dirty, unstable, draft, has_hooks, or unknown while it computes.
  mergeable_state: string
  updated_at: string
}

export type PullsResult = {
  pulls: PullRequest[]
  credential: 'connector' | 'gh' | 'none'
  note?: string
}

type ToolBlock = {
  type: 'tool_use'
  name: string
  input?: Record<string, unknown>
  _result?: { content: string; isError: boolean; durationMs?: number; metadata?: Record<string, unknown> }
}
type MessageLike = { role: string; content: ReadonlyArray<{ type: string }> }

/**
 * A pull request address a tool call of the agent printed, with the window of that call when the runtime timed it. The backend keeps it
 * only if GitHub says the pull request was created inside the window (the call opened it, however it did), and keeps one without a
 * window as it is (see pulls.Candidate).
 */
export type PullCandidate = { url: string; started_at?: string; ended_at?: string }

const SHELL_TOOLS = /bash|shell|powershell|command/i
const GH_PR_CREATE = /\bgh\s+pr\s+create\b/
// The GitHub MCP server and connectors name it create_pull_request, sometimes behind a prefix (mcp__github__create_pull_request).
const CREATE_PULL_TOOL = /create_?pull_?request/i
const PULL_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g
// As many as the backend reads (pulls.MaxCandidates): a call listing pull requests prints many, each is read once.
const MAX_CANDIDATES = 20

/**
 * Whether a call with no timing is the agent opening a pull request: a shell running `gh pr create`, or a tool made to create one. It is
 * the rule for a runtime that does not say when its calls ran; a call that only lists or reads pull requests is left out.
 */
function opensPullRequest(block: ToolBlock): boolean {
  if (CREATE_PULL_TOOL.test(block.name)) return true
  const command = block.input?.command
  return SHELL_TOOLS.test(block.name) && typeof command === 'string' && GH_PR_CREATE.test(command)
}

/** The window of a call, from the start the runtime recorded and its duration. */
function callWindow(block: ToolBlock): { started_at: string; ended_at: string } | null {
  const started = block._result?.metadata?.execution_started_at
  if (typeof started !== 'string') return null
  const start = Date.parse(started)
  if (Number.isNaN(start)) return null
  const metaDuration = block._result?.metadata?.execution_duration_ms
  const duration = block._result?.durationMs ?? (typeof metaDuration === 'number' ? metaDuration : 0)
  return { started_at: new Date(start).toISOString(), ended_at: new Date(start + Math.max(0, duration)).toISOString() }
}

/**
 * The pull request addresses the tool calls of the agent printed, the most recent call first, for the backend to keep the ones those
 * calls opened. Whatever the way (gh pr create, gh api, curl, a script, an MCP tool), a timed call counts; an untimed one only when it is
 * plainly a creation. The person's own pull requests never appear here: only the agent's tool calls are read.
 */
export function collectPullCandidates(messages: readonly MessageLike[]): PullCandidate[] {
  const found: PullCandidate[] = []
  const seen = new Set<string>()
  for (let m = messages.length - 1; m >= 0; m--) {
    const blocks = messages[m].content
    for (let b = blocks.length - 1; b >= 0; b--) {
      const block = blocks[b] as ToolBlock
      if (block.type !== 'tool_use' || !block._result || block._result.isError) continue
      const urls = [...block._result.content.matchAll(PULL_URL)].map((match) => match[0])
      if (urls.length === 0) continue
      const window = callWindow(block)
      if (!window && !opensPullRequest(block)) continue
      for (const url of urls.reverse()) {
        const candidate: PullCandidate = window ? { url, ...window } : { url }
        const key = `${url}@${candidate.started_at ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        found.push(candidate)
        if (found.length >= MAX_CANDIDATES) return found
      }
    }
  }
  return found
}

/**
 * Where a pull request stands, in one word for the icon: running while its checks run (or GitHub has not worked out whether it merges),
 * ready once the checks passed and GitHub says it merges cleanly, failing on a failed check or a conflict, waiting when it needs a review
 * or is behind its base branch.
 */
export type PullStatus = 'running' | 'ready' | 'failing' | 'waiting' | 'draft' | 'merged' | 'closed'

export function pullStatus(pull: Pick<PullRequest, 'state' | 'checks' | 'mergeable_state'>): PullStatus {
  if (pull.state === 'merged' || pull.state === 'closed' || pull.state === 'draft') return pull.state
  if (pull.checks === 'failing' || pull.mergeable_state === 'dirty' || pull.mergeable_state === 'unstable') return 'failing'
  if (pull.checks === 'pending') return 'running'
  if (pull.mergeable_state === 'clean' || pull.mergeable_state === 'has_hooks') return 'ready'
  if (pull.mergeable_state === 'blocked' || pull.mergeable_state === 'behind') return 'waiting'
  return 'running'
}

/** What the icon says when the pointer rests on it. */
export function pullStatusLabel(pull: Pick<PullRequest, 'state' | 'checks' | 'mergeable_state'>): string {
  switch (pullStatus(pull)) {
    case 'running':
      return pull.checks === 'pending' ? 'Checks running' : 'GitHub is checking whether it can be merged'
    case 'ready':
      return 'Ready to merge'
    case 'failing':
      return pull.mergeable_state === 'dirty' ? 'Conflicts with its base branch' : 'Checks failing'
    case 'waiting':
      return pull.mergeable_state === 'behind' ? 'Behind its base branch' : 'Blocked: a review or a required check is missing'
    case 'draft':
      return 'Draft'
    case 'merged':
      return 'Merged'
    case 'closed':
      return 'Closed'
  }
}

/** The message that asks the agent of the session to merge a pull request it opened. */
export function mergeRequestMessage(pull: Pick<PullRequest, 'owner' | 'repo' | 'number' | 'url'>): string {
  return `The pull request ${pull.owner}/${pull.repo}#${pull.number} (${pull.url}) that you opened has passed its checks and GitHub says it can be merged. Merge it with the merge method this repository uses, then confirm that it is merged.`
}

/** The line under a pull request title: where it lives. */
export function pullSubtitle(pull: Pick<PullRequest, 'owner' | 'repo' | 'number'>): string {
  return `${pull.repo} #${pull.number}`
}
