import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PullRequest } from '@renderer/lib/pullRequests'
import { ChangesList } from './ChangesList'

const pull = (overrides: Partial<PullRequest>): PullRequest => ({
  owner: 'KPO-Tech', repo: 'SeshatOS', number: 279, title: 'feat(chat): teach the drawing', url: 'https://github.com/KPO-Tech/SeshatOS/pull/279',
  state: 'open', additions: 12, deletions: 3, checks: 'passing', mergeable_state: 'clean', updated_at: '2026-10-31T10:00:00Z', ...overrides
})

const render = (pulls: PullRequest[], extra: Partial<Parameters<typeof ChangesList>[0]> = {}) =>
  renderToStaticMarkup(createElement(ChangesList, { pulls, onRefresh: () => undefined, ...extra }))

describe('ChangesList', () => {
  it('draws the title, the place, the lines and where the pull request stands', () => {
    const html = render([pull({})])
    expect(html).toContain('feat(chat): teach the drawing')
    expect(html).toContain('SeshatOS #279')
    expect(html).toContain('+12')
    expect(html).toContain('aria-label="Ready to merge"')
  })

  it('blinks while the checks run and says when they fail or the pull request is merged', () => {
    const html = render([
      pull({ checks: 'pending', mergeable_state: 'unknown' }),
      pull({ number: 280, checks: 'failing' }),
      pull({ number: 281, state: 'merged' })
    ])
    expect(html.match(/<li /g)).toHaveLength(3)
    expect(html).toContain('aria-label="Checks running"')
    expect(html).toContain('animate-pulse')
    expect(html).toContain('aria-label="Checks failing"')
    expect(html).toContain('aria-label="Merged"')
  })

  it('offers Merge on a ready pull request only where the agent can be asked', () => {
    expect(render([pull({})])).not.toContain('>Merge<')
    expect(render([pull({})], { onMerge: () => undefined })).toContain('>Merge<')
    expect(render([pull({ checks: 'pending' })], { onMerge: () => undefined })).not.toContain('>Merge<')
  })

  it('says when a pull request will be merged once ready', () => {
    const html = render([pull({ checks: 'pending' })], { armed: ['https://github.com/KPO-Tech/SeshatOS/pull/279'], onToggleArmed: () => undefined })
    expect(html).toContain('merges when ready')
  })
})
