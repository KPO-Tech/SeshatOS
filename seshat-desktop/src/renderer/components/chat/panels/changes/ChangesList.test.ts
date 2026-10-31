import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PullRequest } from '@renderer/lib/pullRequests'
import { ChangesList } from './ChangesList'

const pull = (overrides: Partial<PullRequest>): PullRequest => ({
  owner: 'KPO-Tech', repo: 'SeshatOS', number: 279, title: 'feat(chat): teach the drawing', url: 'https://github.com/KPO-Tech/SeshatOS/pull/279',
  state: 'open', additions: 12, deletions: 3, checks: 'passing', updated_at: '2026-10-31T10:00:00Z', from_session: false, ...overrides
})

const render = (pulls: PullRequest[]) => renderToStaticMarkup(createElement(ChangesList, { pulls, onRefresh: () => undefined }))

describe('ChangesList', () => {
  it('draws the title, the place, the lines and the state of the checks', () => {
    const html = render([pull({})])
    expect(html).toContain('feat(chat): teach the drawing')
    expect(html).toContain('SeshatOS #279')
    expect(html).toContain('+12')
    expect(html).toContain('aria-label="Checks passed"')
    expect(html).toContain('title="Open"')
  })

  it('draws one row per pull request and shows a merged one, failing checks and a running check', () => {
    const html = render([pull({ state: 'merged', checks: 'failing' }), pull({ number: 280, state: 'draft', checks: 'pending', additions: 0, deletions: 0 })])
    expect(html.match(/<li /g)).toHaveLength(2)
    expect(html).toContain('title="Merged"')
    expect(html).toContain('aria-label="Checks failing"')
    expect(html).toContain('title="Draft"')
    expect(html).toContain('animate-pulse')
  })
})
