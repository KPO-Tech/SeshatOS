import { describe, expect, it } from 'vitest'
import type { ChatSession } from '@renderer/stores/session'
import { ago, askSessions } from './historyList'

const session = (id: string, patch: Partial<ChatSession>): ChatSession => ({ id, title: id, messages: [], createdAt: '2026-10-01T10:00:00Z', ...patch })

describe('askSessions', () => {
  it('keeps the conversations of the Ask view only, the latest first', () => {
    const list = askSessions([
      session('chat', { source: undefined, updatedAt: '2026-10-28T10:00:00Z' }),
      session('old', { source: 'knowledge', updatedAt: '2026-10-02T10:00:00Z' }),
      session('new', { source: 'knowledge', updatedAt: '2026-10-27T10:00:00Z' }),
      session('no-update', { source: 'knowledge', createdAt: '2026-10-10T10:00:00Z' })
    ])
    expect(list.map((item) => item.id)).toEqual(['new', 'no-update', 'old'])
  })
})

describe('ago', () => {
  const now = Date.parse('2026-10-28T12:00:00Z')
  it('says how long ago in the unit that fits', () => {
    expect(ago('2026-10-28T11:59:40Z', now)).toBe('just now')
    expect(ago('2026-10-28T11:55:00Z', now)).toBe('5 min ago')
    expect(ago('2026-10-28T09:00:00Z', now)).toBe('3 h ago')
    expect(ago('2026-10-27T09:00:00Z', now)).toBe('yesterday')
    expect(ago('2026-10-24T12:00:00Z', now)).toBe('4 days ago')
  })
  it('says nothing for a date that is not one', () => {
    expect(ago(undefined, now)).toBe('')
    expect(ago('nope', now)).toBe('')
  })
})
