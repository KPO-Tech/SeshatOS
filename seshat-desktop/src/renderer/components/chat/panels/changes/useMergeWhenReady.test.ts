import { describe, expect, it } from 'vitest'
import type { PullRequest } from '@renderer/lib/pullRequests'
import { nextMerge } from './useMergeWhenReady'

const pull = (number: number, overrides: Partial<PullRequest> = {}): PullRequest => ({
  owner: 'o', repo: 'r', number, title: `PR ${number}`, url: `https://github.com/o/r/pull/${number}`,
  state: 'open', additions: 1, deletions: 0, checks: 'passing', mergeable_state: 'clean', updated_at: '2026-11-02T00:00:00Z', ...overrides
})

describe('nextMerge', () => {
  it('asks for a ready armed pull request and forgets it, so it is asked once', () => {
    const { forget, ask } = nextMerge([pull(1)], ['https://github.com/o/r/pull/1'])
    expect(ask?.number).toBe(1)
    expect(forget).toEqual(['https://github.com/o/r/pull/1'])
  })

  it('never asks for a pull request that was not armed', () => {
    expect(nextMerge([pull(1), pull(2)], ['https://github.com/o/r/pull/3'])).toEqual({ forget: [], ask: null })
  })

  it('waits while the checks run and forgets one merged or closed meanwhile', () => {
    const armed = ['https://github.com/o/r/pull/1', 'https://github.com/o/r/pull/2', 'https://github.com/o/r/pull/3']
    const { forget, ask } = nextMerge([pull(1, { checks: 'pending' }), pull(2, { state: 'merged' }), pull(3, { state: 'closed' })], armed)
    expect(ask).toBeNull()
    expect(forget).toEqual(['https://github.com/o/r/pull/2', 'https://github.com/o/r/pull/3'])
  })

  it('asks for one at a time', () => {
    const { ask } = nextMerge([pull(1), pull(2)], ['https://github.com/o/r/pull/1', 'https://github.com/o/r/pull/2'])
    expect(ask?.number).toBe(1)
  })
})
