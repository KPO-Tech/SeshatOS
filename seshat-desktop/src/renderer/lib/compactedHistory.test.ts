import { describe, expect, it } from 'vitest'
import type { Message } from '@renderer/api/types'
import {
  COMPACTION_DIVIDER_ID,
  compactionDivider,
  isArchivedMessage,
  isCompactionDivider,
  withArchivedHistory,
} from './compactedHistory'

function text(id: string, role: Message['role'], value: string): Message {
  return { id, role, content: [{ type: 'text', text: value }] }
}

const renderable = (message: Message) => message.content.some((block) => block.type === 'text' && block.text.trim() !== '')

describe('withArchivedHistory', () => {
  it('returns the current messages untouched when nothing was archived', () => {
    const current = [text('c1', 'user', 'hello')]
    expect(withArchivedHistory(undefined, current, renderable)).toBe(current)
    expect(withArchivedHistory([], current, renderable)).toBe(current)
  })

  it('puts the archived messages first, then a divider, then the current ones', () => {
    const current = [text('c1', 'user', 'latest')]
    const archived = [text('a1', 'user', 'first'), text('a2', 'assistant', 'answer')]
    const shown = withArchivedHistory(archived, current, renderable)
    expect(shown.map((m) => m.id)).toEqual(['a1', 'a2', COMPACTION_DIVIDER_ID, 'c1'])
  })

  it('marks the archived messages and leaves the current ones as they are', () => {
    const current = [text('c1', 'user', 'latest')]
    const shown = withArchivedHistory([text('a1', 'user', 'first')], current, renderable)
    expect(isArchivedMessage(shown[0])).toBe(true)
    expect(isArchivedMessage(shown[shown.length - 1])).toBe(false)
    expect(shown[shown.length - 1]).toBe(current[0])
  })

  it('does not change the archived messages it was given', () => {
    const archived = [text('a1', 'user', 'first')]
    withArchivedHistory(archived, [], renderable)
    expect(archived[0].metadata).toBeUndefined()
  })

  it('keeps the metadata an archived message already had', () => {
    const message: Message = { ...text('a1', 'user', 'first'), metadata: { attachments: [] } }
    const shown = withArchivedHistory([message], [], renderable)
    expect(shown[0].metadata).toMatchObject({ attachments: [], archived: true })
  })

  it('shows no divider when none of the archived messages can be shown', () => {
    const current = [text('c1', 'user', 'latest')]
    const hidden: Message = { id: 'a1', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' } as never] }
    expect(withArchivedHistory([hidden], current, renderable)).toBe(current)
  })
})

describe('compactionDivider', () => {
  it('is recognised as a divider and carries text the list can render', () => {
    const divider = compactionDivider()
    expect(isCompactionDivider(divider)).toBe(true)
    expect(divider.content[0]).toMatchObject({ type: 'text' })
    expect(isCompactionDivider(text('x', 'user', 'hi'))).toBe(false)
  })
})
