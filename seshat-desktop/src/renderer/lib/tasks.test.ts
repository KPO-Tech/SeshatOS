import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('@renderer/api/client', () => ({ api: { get: (...args: unknown[]) => get(...args), post: vi.fn(), delete: vi.fn() } }))

import { isTaskActive, taskFailure, waitForTask, type TaskInfo } from './tasks'

const task = (status: TaskInfo['status'], extra: Partial<TaskInfo> = {}): TaskInfo => ({ id: 't1', kind: 'skill.install', subject: 'a', title: 'Installing a', status, started_at: 1, ...extra })

describe('tasks', () => {
  beforeEach(() => {
    get.mockReset()
    vi.useFakeTimers()
  })

  it('knows which tasks are still going', () => {
    expect(isTaskActive(task('queued'))).toBe(true)
    expect(isTaskActive(task('running'))).toBe(true)
    expect(isTaskActive(task('succeeded'))).toBe(false)
    expect(isTaskActive(task('interrupted'))).toBe(false)
  })

  it('says why a task did not succeed', () => {
    expect(taskFailure(task('failed', { error: 'pip said no' }))).toBe('pip said no')
    expect(taskFailure(task('cancelled'))).toMatch(/cancelled/)
    expect(taskFailure(task('interrupted'))).toMatch(/closed/)
  })

  it('follows a task until it succeeds, reporting each state', async () => {
    get.mockResolvedValueOnce(task('running', { step: 'Creating the environment' })).mockResolvedValueOnce(task('succeeded'))
    const seen: string[] = []
    const waiting = waitForTask('t1', (t) => seen.push(t.status))
    await vi.advanceTimersByTimeAsync(1600)
    await expect(waiting).resolves.toMatchObject({ status: 'succeeded' })
    expect(seen).toEqual(['running', 'succeeded'])
  })

  it('rejects with the reason when the task fails', async () => {
    get.mockResolvedValueOnce(task('failed', { error: 'no matching distribution' }))
    await expect(waitForTask('t1')).rejects.toThrow('no matching distribution')
  })
})
