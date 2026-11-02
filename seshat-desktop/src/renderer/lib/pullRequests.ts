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
  updated_at: string
}

export type PullsResult = {
  pulls: PullRequest[]
  credential: 'connector' | 'gh' | 'none'
  note?: string
}

type ToolBlock = { type: 'tool_use'; name: string; input?: Record<string, unknown>; _result?: { content: string; isError: boolean } }
type MessageLike = { role: string; content: ReadonlyArray<{ type: string }> }

const SHELL_TOOLS = /bash|shell|powershell|command/i
const GH_PR_CREATE = /\bgh\s+pr\s+create\b/
// The GitHub MCP server and connectors name it create_pull_request, sometimes behind a prefix (mcp__github__create_pull_request).
const CREATE_PULL_TOOL = /create_?pull_?request/i
const PULL_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g
const MAX_URLS = 10

/**
 * Whether a tool call is the agent opening a pull request: a shell running `gh pr create`, or a tool made to create one. A call that only
 * lists or reads pull requests (gh pr list, gh pr view) prints addresses too, but those are not the agent's work.
 */
function opensPullRequest(block: ToolBlock): boolean {
  if (CREATE_PULL_TOOL.test(block.name)) return true
  const command = block.input?.command
  return SHELL_TOOLS.test(block.name) && typeof command === 'string' && GH_PR_CREATE.test(command)
}

/** The pull requests the agent of a session opened itself, most recent first, one entry each. Ones the person opened are not listed. */
export function collectPullUrls(messages: readonly MessageLike[]): string[] {
  const found: string[] = []
  for (let m = messages.length - 1; m >= 0; m--) {
    const blocks = messages[m].content
    for (let b = blocks.length - 1; b >= 0; b--) {
      const block = blocks[b] as ToolBlock
      if (block.type !== 'tool_use' || !opensPullRequest(block) || !block._result || block._result.isError) continue
      for (const url of [...block._result.content.matchAll(PULL_URL)].map((match) => match[0]).reverse()) {
        if (!found.includes(url)) found.push(url)
        if (found.length >= MAX_URLS) return found
      }
    }
  }
  return found
}

export const STATE_LABEL: Record<PullState, string> = { open: 'Open', draft: 'Draft', merged: 'Merged', closed: 'Closed' }

export const CHECKS_LABEL: Record<PullChecks, string> = {
  passing: 'Checks passed',
  failing: 'Checks failing',
  pending: 'Checks running',
  none: 'No checks',
  unknown: 'Checks unavailable'
}

/** The line under a pull request title: where it lives. */
export function pullSubtitle(pull: Pick<PullRequest, 'owner' | 'repo' | 'number'>): string {
  return `${pull.repo} #${pull.number}`
}
