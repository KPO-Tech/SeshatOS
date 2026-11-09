import { describe, expect, it } from 'vitest'
import type { Message } from '@renderer/api/types'
import { lastPrompt, withoutLastAnswer } from './regenerate'

function said(id: string, text: string): Message {
  return { id, role: 'user', content: [{ type: 'text', text }] }
}

function answered(id: string, text: string): Message {
  return { id, role: 'assistant', content: [{ type: 'text', text }] }
}

function toolResult(id: string): Message {
  return { id, role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'ok' } as never] }
}

describe('lastPrompt', () => {
  it('is the last message the person wrote, not a tool result', () => {
    const messages = [said('u1', 'first'), answered('a1', 'one'), said('u2', 'second'), answered('a2', 'calling'), toolResult('r1'), answered('a3', 'done')]
    expect(lastPrompt(messages)).toEqual({ index: 2, text: 'second' })
  })

  it('is null when nobody wrote anything', () => {
    expect(lastPrompt([])).toBeNull()
    expect(lastPrompt([answered('a1', 'hi')])).toBeNull()
  })
})

describe('withoutLastAnswer', () => {
  const messages = [said('u1', 'first'), answered('a1', 'one'), said('u2', 'second'), answered('a2', 'two')]

  it('keeps the prompt where it is and drops what follows it', () => {
    const kept = withoutLastAnswer(messages, 'second')
    expect(kept?.map((message) => message.id)).toEqual(['u1', 'a1', 'u2'])
  })

  it('also drops an answer that failed and the error it carries', () => {
    const failed = [said('u1', 'first'), answered('a1', 'one'), { ...said('u2', 'second'), status: 'error' as const }, answered('a2', 'Something went wrong')]
    expect(withoutLastAnswer(failed, 'second')?.map((message) => message.id)).toEqual(['u1', 'a1', 'u2'])
  })

  it('is null for a prompt that is not the one of the last turn: that is a new turn', () => {
    expect(withoutLastAnswer(messages, 'first')).toBeNull()
    expect(withoutLastAnswer(messages, 'second, edited')).toBeNull()
  })

  it('ignores the spaces around the prompt', () => {
    expect(withoutLastAnswer(messages, '  second ')?.length).toBe(3)
  })
})
