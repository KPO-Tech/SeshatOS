import { describe, expect, it } from 'vitest'
import type { Message, ToolStatus } from '@renderer/api/types'
import { compactionDivider } from '@renderer/lib/compactedHistory'
import { foldSteps, layoutTurns, listRows } from './turns'

function asked(text: string): Message {
  return { id: `user-${text}`, role: 'user', content: [{ type: 'text', text }] }
}

function step(id: string, ...content: Message['content']): Message {
  return { id, role: 'assistant', content }
}

function read(id: string, status?: ToolStatus): Message['content'][number] {
  return { type: 'tool_use', id, name: 'read', input: { file_path: 'a.ts' }, ...(status ? { _status: status } : {}) }
}

function plan(id: string): Message['content'][number] {
  return { type: 'tool_use', id, name: 'submit_plan', input: {} }
}

function tool(name: string, id: string): Message['content'][number] {
  return { type: 'tool_use', id, name, input: {} }
}

function said(id: string, text: string): Message {
  return step(id, { type: 'text', text })
}

function ids(messages: Message[]): Array<string | undefined> {
  return messages.map((message) => message.id)
}

describe('listRows', () => {
  it('draws the steps the runtime splits as one row, across their tool results', () => {
    const rows = listRows([
      asked('go'),
      step('a1', tool('bash', 't1')),
      { id: 'r1', role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '' }] },
      step('a2', tool('bash', 't2')),
    ])

    expect(rows.map((row) => row.merged)).toEqual([false, false, false, true])
    expect(rows[1].message.content.map((block) => (block.type === 'tool_use' ? block.id : ''))).toEqual(['t1', 't2'])
  })

  it('ends the run where the agent says something of its own', () => {
    const rows = listRows([step('a1', tool('bash', 't1')), said('a2', 'Here.'), step('a3', tool('bash', 't2'))])

    expect(rows.map((row) => row.merged)).toEqual([false, false, false])
    expect(rows[2].message.id).toBe('a3')
  })

  it('leaves a card waiting for the reader in its own row', () => {
    const rows = listRows([step('a1', tool('bash', 't1')), step('a2', read('t2', 'awaiting_approval'))])

    expect(rows[1].merged).toBe(false)
    expect(rows[1].message.content).toHaveLength(1)
  })
})

describe('layoutTurns', () => {
  it('folds every step of a turn onto its last message', () => {
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

  it('folds the steps before a plan above it, and the ones after below', () => {
    const layout = layoutTurns([asked('go'), step('a1', read('t1')), step('a2', plan('p1')), step('a3', read('t2')), said('a4', 'summary')])

    expect(layout[2].folded).toBe(false)
    expect(ids(layout[2].foldedMessages)).toEqual(['a1'])
    expect(layout[3].folded).toBe(true)
    expect(ids(layout[4].foldedMessages)).toEqual(['a3'])
  })

  it('keeps what a turn produced on screen: an image, an audio file, a document', () => {
    for (const name of ['generate_image', 'text_to_speech', 'docx', 'present_artifact']) {
      const layout = layoutTurns([asked('go'), step('a1', tool(name, 't1')), said('a2', 'done')])
      expect(layout[1].folded, name).toBe(false)
      expect(layout[2].foldedMessages, name).toEqual([])
    }
  })

  it('folds a sub-agent with the rest of the turn', () => {
    const layout = layoutTurns([asked('go'), step('a1', tool('agent', 't1')), said('a2', 'done')])

    expect(layout[1].folded).toBe(true)
    expect(ids(layout[2].foldedMessages)).toEqual(['a1'])
  })

  it('still folds the work around a step that stays in place', () => {
    const layout = layoutTurns([asked('go'), step('a1', read('t1')), step('a2', tool('generate_image', 't2')), step('a3', read('t3')), said('a4', 'here it is')])

    expect(ids(layout[2].foldedMessages)).toEqual(['a1'])
    expect(ids(layout[4].foldedMessages)).toEqual(['a3'])
  })

  it('keeps a card waiting for the user on screen', () => {
    const layout = layoutTurns([asked('go'), step('a1', read('t1')), step('a2', read('t2', 'awaiting_approval')), said('a3', 'done')])

    expect(layout[2].folded).toBe(false)
    expect(ids(layout[2].foldedMessages)).toEqual(['a1'])
    expect(layout[3].foldedMessages).toEqual([])
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

describe('foldSteps', () => {
  it('runs tool calls of separate messages together', () => {
    const steps = foldSteps([step('a1', read('t1')), step('a2', read('t2')), step('a3', read('t3'))])

    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('tools')
    if (steps[0].kind !== 'tools') return
    expect(steps[0].items.map((item) => (item.kind === 'tool' ? item.tool.id : item.thinkingId))).toEqual(['t1', 't2', 't3'])
  })

  it('lets a message that says something stand on its own, between two runs', () => {
    const steps = foldSteps([step('a1', read('t1')), said('a2', 'now reading'), step('a3', read('t2'))])

    expect(steps.map((entry) => entry.kind)).toEqual(['tools', 'message', 'tools'])
  })

  it('folds a thought into the run it sits in', () => {
    const steps = foldSteps([step('a1', { type: 'thinking', thinking: 'looking' }, read('t1'))])

    if (steps[0].kind !== 'tools') throw new Error('expected a run')
    expect(steps[0].items.map((item) => item.kind)).toEqual(['thinking', 'tool'])
  })

  it('draws nothing for a step the chat never shows', () => {
    expect(foldSteps([step('a1', { type: 'tool_use', id: 't1', name: 'task_create', input: {} })])).toEqual([])
  })
})
