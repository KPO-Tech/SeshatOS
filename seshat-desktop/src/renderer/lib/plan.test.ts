import { describe, expect, it } from 'vitest'
import type { Message } from '@renderer/api/types'
import { derivePlanSnapshot } from './plan'

function step(...content: Message['content']): Message {
  return { id: 'step', role: 'assistant', content }
}

function create(id: string, input: Record<string, unknown>, result = ''): Message['content'][number] {
  return { type: 'tool_use', id, name: 'task_create', input, _result: { content: result, isError: false } }
}

function update(id: string, taskId: string, status: string, extra: Record<string, unknown> = {}): Message['content'][number] {
  return { type: 'tool_use', id, name: 'task_update', input: { taskId, status, ...extra }, _result: { content: '', isError: false } }
}

describe('derivePlanSnapshot', () => {
  it('takes the title from whichever field the engine filled', () => {
    const plan = derivePlanSnapshot([step(create('t1', { title: 'Read the project' }, 'Task #42 created successfully'))])

    expect(plan.items.map((item) => item.title)).toEqual(['Read the project'])
    expect(plan.items[0].id).toBe('42')
  })

  it('gives a created task its own updates instead of a second row', () => {
    const plan = derivePlanSnapshot([
      step(create('t1', { subject: 'Read the project' })),
      step(update('u1', '1794-1', 'in_progress')),
      step(update('u2', '1794-1', 'completed')),
    ])

    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ id: '1794-1', title: 'Read the project', status: 'completed' })
    expect(plan.completedCount).toBe(1)
  })

  it('leaves a task the engine never named without a title, for the panel to word', () => {
    const plan = derivePlanSnapshot([step(update('u1', '1794-2', 'pending'))])

    expect(plan.items[0].title).toBe('')
  })
})
