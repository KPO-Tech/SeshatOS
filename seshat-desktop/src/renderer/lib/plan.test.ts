import { describe, expect, it } from 'vitest'
import type { Message } from '@renderer/api/types'
import { derivePlanSnapshot } from './plan'

function step(...content: Message['content']): Message {
  return { id: 'step', role: 'assistant', content }
}

type Block = Message['content'][number]

function create(id: string, input: Record<string, unknown>, result = ''): Block {
  return { type: 'tool_use', id, name: 'task_create', input, _result: { content: result, isError: false } }
}

function update(id: string, input: Record<string, unknown>): Block {
  return { type: 'tool_use', id, name: 'task_update', input, _result: { content: '', isError: false } }
}

describe('derivePlanSnapshot', () => {
  it('takes the title and the id of every task created in one call', () => {
    const plan = derivePlanSnapshot([
      step(
        create(
          't1',
          { tasks: [{ subject: 'Read the parser' }, { subject: 'Write the formatter' }] },
          'Task #1794-1 created successfully\nTask #1794-2 created successfully',
        ),
      ),
    ])

    expect(plan.items.map((item) => [item.id, item.title])).toEqual([
      ['1794-1', 'Read the parser'],
      ['1794-2', 'Write the formatter'],
    ])
  })

  it('binds a batch created without ids to the ids its updates name', () => {
    const plan = derivePlanSnapshot([
      step(create('t1', { tasks: [{ subject: 'Read the parser' }, { subject: 'Write the formatter' }] })),
      step(
        update('u1', {
          updates: [
            { taskId: '1794-1', status: 'completed' },
            { taskId: '1794-2', status: 'in_progress' },
          ],
        }),
      ),
    ])

    expect(plan.items.map((item) => [item.id, item.title, item.status])).toEqual([
      ['1794-1', 'Read the parser', 'completed'],
      ['1794-2', 'Write the formatter', 'in_progress'],
    ])
    expect(plan.completedCount).toBe(1)
    expect(plan.activeCount).toBe(1)
  })

  it('keeps the title and the status of a task an update only touches by id', () => {
    const plan = derivePlanSnapshot([
      step(create('t1', { tasks: [{ subject: 'Read the parser' }] })),
      step(update('u1', { taskId: '1794-1', status: 'completed' })),
      step(update('u2', { taskId: '1794-1', description: 'Now with tests' })),
    ])

    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ id: '1794-1', title: 'Read the parser', status: 'completed' })
  })

  it('leaves a task the engine never named without a title, for the panel to word', () => {
    const plan = derivePlanSnapshot([step(update('u1', { taskId: '1794-2', status: 'pending' }))])

    expect(plan.items[0].title).toBe('')
  })
})
