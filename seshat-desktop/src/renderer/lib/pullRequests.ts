// The pull requests a session talked about, and how the Changes card words them.

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
  from_session: boolean
}

export type PullsResult = {
  pulls: PullRequest[]
  credential: 'connector' | 'gh' | 'none'
  note?: string
}

type ToolBlock = { type: 'tool_use'; name: string; _result?: { content: string; isError: boolean } }
type MessageLike = { role: string; content: ReadonlyArray<{ type: string }> }

// Tools whose output holds the address of a pull request the agent opened or looked at: a shell running `gh pr create` or the GitHub connector.
const SOURCE_TOOLS = /bash|shell|powershell|command|pull_request/i
const PULL_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g
const MAX_URLS = 10

/** The pull request addresses printed by the tools of a session, most recent first, one entry each. */
export function collectPullUrls(messages: readonly MessageLike[]): string[] {
  const found: string[] = []
  for (let m = messages.length - 1; m >= 0; m--) {
    const blocks = messages[m].content
    for (let b = blocks.length - 1; b >= 0; b--) {
      const block = blocks[b] as ToolBlock
      if (block.type !== 'tool_use' || !SOURCE_TOOLS.test(block.name) || !block._result || block._result.isError) continue
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
