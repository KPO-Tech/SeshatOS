import { describe, expect, it } from 'vitest'
import type { Message } from '@renderer/api/types'
import { isInterruptedTurnNote } from './interruptedTurnNote'

const user = (id: string, text: string): Message => ({ id, role: 'user', content: [{ type: 'text', text }] })

describe('isInterruptedTurnNote', () => {
  it('knows the note by its id or by its text', () => {
    expect(isInterruptedTurnNote(user('msg-interrupted-t1', 'anything'))).toBe(true)
    expect(isInterruptedTurnNote(user('m1', '[The previous turn was interrupted by the user before it finished.]'))).toBe(true)
    expect(isInterruptedTurnNote(user('m2', '[The previous turn stopped because of an error: timeout before it finished.]'))).toBe(true)
  })

  it('leaves what the person wrote, and the agent', () => {
    expect(isInterruptedTurnNote(user('m3', 'The previous turn was good, continue'))).toBe(false)
    expect(isInterruptedTurnNote({ id: 'msg-interrupted-x', role: 'assistant', content: [{ type: 'text', text: 'hi' }] })).toBe(false)
  })
})
