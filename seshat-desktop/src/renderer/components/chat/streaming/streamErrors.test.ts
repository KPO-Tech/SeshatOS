import { describe, expect, it } from 'vitest'
import { errorMarkdown, errorPresentation } from './streamErrors'

describe('errorPresentation', () => {
  it('uses the kind the backend named', () => {
    expect(errorPresentation('anything', 'context_length').title).toBe('Conversation too long for this model')
    expect(errorPresentation('anything', 'quota').title).toBe('Provider credit exhausted')
  })

  it('falls back to the text when the kind is missing or unknown', () => {
    expect(errorPresentation('HTTP 429 rate limit').title).toBe('Provider rate limit')
    expect(errorPresentation('tier_not_allowed', 'made-up').title).toBe('Provider access error')
    expect(errorPresentation('failed to reach the host').title).toBe('Connection error')
    expect(errorPresentation('boom').title).toBe('Provider error')
  })

  it('shows the raw message under the hint', () => {
    const markdown = errorMarkdown('invalid key', 'auth')
    expect(markdown).toContain('> Provider key refused')
    expect(markdown).toContain('Config')
    expect(markdown).toContain('invalid key')
  })
})
