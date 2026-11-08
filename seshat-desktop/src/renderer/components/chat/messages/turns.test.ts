import { describe, expect, it } from 'vitest'
import type { Message, ToolStatus } from '@renderer/api/types'
import { compactionDivider } from '@renderer/lib/compactedHistory'
import { layoutTurns } from './turns'

function asked(text: string): Message {
  return { id: `user-${text}`, role: 'user', content: [{ type: 'text', text }] }
}

function step(id: string, ...content: Message['content']): Message {
  return { id, role: 'assistant', content }
}

function read(id: string, status?: ToolStatus): Message['content'][number] {
  return { type: 'tool_use', id, name: 'read', input: { file_path: 'a.ts' }, ...(status ? { _status: status } : {}) }
}

function said(id: string, text: string): Message {
  return step(id, { type: 'text', text })
}

function ids(messages: Message[]): Array<string | undefined> {
  return messages.map((message) => message.id)
}

describe('layoutTurns', () => {
  it('folds every step of a turn except its last message', () => {
    const layout = layoutTurns([asked('go'), step('a1', read('t1')), step('a2', read('t2')), said('a3', 'done')])

    expect(layout[1].folded).toBe(true)
    expect(layout[2].folded).toBe(true)
    expect(layout[3].folded).toBe(false)
    expect(ids(layout[3].foldedMessages)).toEqual(['a1', 'a2'])
    expect(layout[0].foldedMessages).toEqual([])
  })

  it('leaves a turn of a single message alone', () => {
    const layout = layoutTurns([asked('go'), said('a1', 'done')])

    expect(layout.map((turn) => turn.folded)).toEqual([false, false])
    expect(layout[1].foldedMessages).toEqual([])
  })

  it('folds nothing when a step is waiting for the user', () => {
    const layout = layoutTurns([asked('go'), step('a1', read('t1', 'awaiting_approval')), said('a2', 'done')])

    expect(layout[1].folded).toBe(false)
    expect(layout[2].foldedMessages).toEqual([])
  })

  it('keeps a tool result separator inside the turn it belongs to', () => {
    const separator: Message = { id: 'r1', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] }
    const layout = layoutTurns([asked('go'), step('a1', read('t1')), separator, said('a2', 'done')])

    expect(layout[1].folded).toBe(true)
    expect(ids(layout[3].foldedMessages)).toEqual(['a1'])
  })

  it('ends a turn at a compaction divider instead of folding across it', () => {
    const layout = layoutTurns([asked('go'), step('a1', read('t1')), compactionDivider(), said('a2', 'done')])

    expect(layout[1].folded).toBe(false)
    expect(layout[3].foldedMessages).toEqual([])
  })

  it('starts the next turn on the message that asked', () => {
    const layout = layoutTurns([asked('go'), step('a1', read('t1')), said('a2', 'done'), asked('again'), step('b1', read('t2')), said('b2', 'done again')])

    expect(layout[1].turnStart).toBe(0)
    expect(layout[2].turnStart).toBe(0)
    expect(ids(layout[2].foldedMessages)).toEqual(['a1'])
    expect(layout[4].turnStart).toBe(3)
    expect(ids(layout[5].foldedMessages)).toEqual(['b1'])
  })
})
