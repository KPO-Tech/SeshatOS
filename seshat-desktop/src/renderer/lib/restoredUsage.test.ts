import { describe, expect, it } from 'vitest'
import type { Message } from '@renderer/api/types'
import { restoredUsageFromSession } from './restoredUsage'

const assistant = (usage?: { input_tokens: number; output_tokens: number }): Message => ({ role: 'assistant', content: [], metadata: usage ? { usage } : undefined })
const user = (): Message => ({ role: 'user', content: [] })

describe('restoredUsageFromSession', () => {
  it('uses the turn count and the last assistant reply usage', () => {
    const result = restoredUsageFromSession({
      total_turns: 2,
      messages: [user(), assistant({ input_tokens: 100, output_tokens: 10 }), user(), assistant({ input_tokens: 250, output_tokens: 40 })],
    })
    expect(result).toEqual({ turnNumber: 2, inputTokens: 250, outputTokens: 40 })
  })

  it('skips replies without usage', () => {
    const result = restoredUsageFromSession({ total_turns: 1, messages: [assistant({ input_tokens: 90, output_tokens: 5 }), assistant()] })
    expect(result).toEqual({ turnNumber: 1, inputTokens: 90, outputTokens: 5 })
  })

  it('returns null for a session that never ran', () => {
    expect(restoredUsageFromSession({ total_turns: 0, messages: [user()] })).toBeNull()
  })
})
