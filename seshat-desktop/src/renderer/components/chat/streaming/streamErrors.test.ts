import { beforeAll, describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { englishT } from '@renderer/i18n/testing'
import { errorMarkdown, errorPresentation } from './streamErrors'

describe('errorPresentation', () => {
  let t: TFunction
  beforeAll(async () => {
    t = await englishT()
  })

  it('uses the kind the backend named', () => {
    expect(errorPresentation('anything', 'context_length', t).title).toBe('Conversation too long for this model')
    expect(errorPresentation('anything', 'quota', t).title).toBe('Provider credit exhausted')
  })

  it('falls back to the text when the kind is missing or unknown', () => {
    expect(errorPresentation('HTTP 429 rate limit', undefined, t).title).toBe('Provider rate limit')
    expect(errorPresentation('tier_not_allowed', 'made-up', t).title).toBe('Provider access error')
    expect(errorPresentation('failed to reach the host', undefined, t).title).toBe('Connection error')
    expect(errorPresentation('boom', undefined, t).title).toBe('Provider error')
  })

  it('shows the raw message under the hint', () => {
    const markdown = errorMarkdown('invalid key', 'auth', t)
    expect(markdown).toContain('> Provider key refused')
    expect(markdown).toContain('Config')
    expect(markdown).toContain('invalid key')
  })
})
