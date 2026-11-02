import { describe, expect, it } from 'vitest'
import { collectPullCandidates, mergeRequestMessage, pullStatus, pullSubtitle } from './pullRequests'

const tool = (name: string, content: string, input: Record<string, unknown> = {}, isError = false) => ({ type: 'tool_use' as const, name, input, _result: { content, isError } })
const create = (name: string, content: string, isError = false) => tool(name, content, { command: 'gh pr create --base dev --fill' }, isError)
// A call the runtime timed: it started at `started` and ran for `ms`.
const timed = (name: string, content: string, started: string, ms: number, input: Record<string, unknown> = {}) => ({
  type: 'tool_use' as const, name, input, _result: { content, isError: false, durationMs: ms, metadata: { execution_started_at: started } }
})
const assistant = (...content: Array<{ type: string }>) => ({ role: 'assistant', content })
const urls = (candidates: Array<{ url: string }>) => candidates.map((c) => c.url)

describe('collectPullCandidates', () => {
  it('passes any timed call that printed an address, with its window, whatever the tool', () => {
    const found = collectPullCandidates([
      assistant(timed('bash', '{"html_url":"https://github.com/o/r/pull/9"}', '2026-11-02T10:00:00Z', 1500, { command: 'gh api repos/o/r/pulls -f title=x' })),
      assistant(timed('python', 'created https://github.com/o/r/pull/10', '2026-11-02T10:05:00.250Z', 800))
    ])
    expect(found).toEqual([
      { url: 'https://github.com/o/r/pull/10', started_at: '2026-11-02T10:05:00.250Z', ended_at: '2026-11-02T10:05:01.050Z' },
      { url: 'https://github.com/o/r/pull/9', started_at: '2026-11-02T10:00:00.000Z', ended_at: '2026-11-02T10:00:01.500Z' }
    ])
  })

  it('passes a timed gh pr list too: the backend leaves it out by its creation date', () => {
    const found = collectPullCandidates([assistant(timed('bash', 'https://github.com/o/r/pull/1', '2026-11-02T10:00:00Z', 300, { command: 'gh pr list' }))])
    expect(found).toHaveLength(1)
    expect(found[0].started_at).toBeDefined()
  })

  it('without timing, keeps only a plain creation, with no window', () => {
    expect(collectPullCandidates([assistant(create('Bash', 'https://github.com/KPO-Tech/SeshatOS/pull/344\n'))])).toEqual([{ url: 'https://github.com/KPO-Tech/SeshatOS/pull/344' }])
    expect(urls(collectPullCandidates([assistant(tool('mcp__github__create_pull_request', '{"html_url":"https://github.com/o/r/pull/8"}'))]))).toEqual(['https://github.com/o/r/pull/8'])
    expect(collectPullCandidates([
      assistant(tool('bash', 'https://github.com/o/r/pull/1 https://github.com/o/r/pull/2', { command: 'gh pr list' })),
      assistant(tool('mcp__github__get_pull_request', 'https://github.com/o/r/pull/4'))
    ])).toEqual([])
  })

  it('lists the most recent call first, and the same call once per address', () => {
    const found = collectPullCandidates([
      assistant(create('bash', 'https://github.com/o/r/pull/1')),
      assistant(create('powershell', 'https://github.com/o/r/pull/2 https://github.com/o/r/pull/2'))
    ])
    expect(urls(found)).toEqual(['https://github.com/o/r/pull/2', 'https://github.com/o/r/pull/1'])
  })

  it('ignores failed calls and other hosts', () => {
    expect(collectPullCandidates([
      assistant(create('bash', 'https://github.com/o/r/pull/3', true)),
      assistant(create('bash', 'https://gitlab.com/o/r/pull/5'))
    ])).toEqual([])
  })

  it('stops at twenty', () => {
    const text = Array.from({ length: 30 }, (_, i) => `https://github.com/o/r/pull/${i + 1}`).join(' ')
    expect(collectPullCandidates([assistant(create('bash', text))])).toHaveLength(20)
  })
})

describe('pullStatus', () => {
  const open = { state: 'open' as const, checks: 'passing' as const }
  it('is ready only when the checks passed and GitHub says it merges cleanly', () => {
    expect(pullStatus({ ...open, mergeable_state: 'clean' })).toBe('ready')
    expect(pullStatus({ ...open, checks: 'none', mergeable_state: 'clean' })).toBe('ready')
    expect(pullStatus({ ...open, mergeable_state: 'unknown' })).toBe('running')
  })

  it('runs while the checks run, fails on a failed check or a conflict, waits on a review or a base branch ahead', () => {
    expect(pullStatus({ ...open, checks: 'pending', mergeable_state: 'blocked' })).toBe('running')
    expect(pullStatus({ ...open, checks: 'failing', mergeable_state: 'blocked' })).toBe('failing')
    expect(pullStatus({ ...open, mergeable_state: 'dirty' })).toBe('failing')
    expect(pullStatus({ ...open, mergeable_state: 'blocked' })).toBe('waiting')
    expect(pullStatus({ ...open, mergeable_state: 'behind' })).toBe('waiting')
  })

  it('keeps merged, closed and draft as they are', () => {
    expect(pullStatus({ state: 'merged', checks: 'failing', mergeable_state: 'dirty' })).toBe('merged')
    expect(pullStatus({ state: 'closed', checks: 'passing', mergeable_state: 'clean' })).toBe('closed')
    expect(pullStatus({ state: 'draft', checks: 'passing', mergeable_state: 'draft' })).toBe('draft')
  })
})

describe('mergeRequestMessage', () => {
  it('names the pull request and asks to merge it the way the repository does', () => {
    const text = mergeRequestMessage({ owner: 'o', repo: 'r', number: 7, url: 'https://github.com/o/r/pull/7' })
    expect(text).toContain('o/r#7')
    expect(text).toContain('https://github.com/o/r/pull/7')
    expect(text).toContain('merge method this repository uses')
  })
})

describe('pullSubtitle', () => {
  it('names the repository and the number', () => {
    expect(pullSubtitle({ owner: 'KPO-Tech', repo: 'SeshatOS', number: 279 })).toBe('SeshatOS #279')
  })
})
