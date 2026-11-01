import { describe, expect, it } from 'vitest'
import { elapsedLabel, finishedMessage, newlyFinished, progressOf, stepLabel } from './taskView'
import type { TaskInfo, TaskStatus } from './tasks'

const task = (extra: Partial<TaskInfo> = {}): TaskInfo => ({ id: 't1', kind: 'skill.install', subject: 'paperasse', title: 'Installing paperasse', status: 'running', started_at: 1000, ...extra })

describe('stepLabel', () => {
  it('says the step and its place', () => {
    expect(stepLabel(task({ step: 'Creating the environment', step_index: 2, step_count: 4 }))).toBe('Creating the environment (2 of 4)')
  })

  it('says when a task waits or has not said anything yet', () => {
    expect(stepLabel(task({ status: 'queued' }))).toBe('Waiting for its turn')
    expect(stepLabel(task())).toBe('Starting')
  })
})

describe('progressOf', () => {
  it('grows with the step and never reaches the end before the task does', () => {
    const at = (index: number) => progressOf(task({ step: 'x', step_index: index, step_count: 4 }))
    expect(at(1)).toBeLessThan(at(2))
    expect(at(4)).toBeLessThan(1)
    expect(progressOf(task({ status: 'succeeded' }))).toBe(1)
  })

  it('shows a little progress before any step', () => {
    expect(progressOf(task())).toBeGreaterThan(0)
  })
})

describe('elapsedLabel', () => {
  it('counts seconds, then minutes', () => {
    expect(elapsedLabel(task(), 1042)).toBe('42 s')
    expect(elapsedLabel(task(), 1185)).toBe('3 min 05 s')
  })

  it('stops at the end of a task that is over', () => {
    expect(elapsedLabel(task({ ended_at: 1010 }), 9999)).toBe('10 s')
  })
})

describe('newlyFinished', () => {
  it('reports a task that was going and is over, once', () => {
    const seen = new Map<string, TaskStatus>()
    expect(newlyFinished(seen, [task()])).toEqual([])
    const over = task({ status: 'succeeded', ended_at: 1100 })
    expect(newlyFinished(seen, [over])).toEqual([over])
    expect(newlyFinished(seen, [over])).toEqual([])
  })

  it('does not report a task that was already over when it was first seen', () => {
    const seen = new Map<string, TaskStatus>()
    expect(newlyFinished(seen, [task({ status: 'failed', error: 'x' })])).toEqual([])
  })
})

describe('finishedMessage', () => {
  it('says what happened and where to look', () => {
    expect(finishedMessage(task({ status: 'succeeded' }))).toMatchObject({ title: 'paperasse is ready', route: '/skills', failed: false })
    expect(finishedMessage(task({ status: 'failed', error: 'pip said no\nmore' }))).toMatchObject({ title: 'Installing paperasse failed', body: 'pip said no', failed: true })
    expect(finishedMessage(task({ status: 'cancelled' })).failed).toBe(false)
  })
  it('speaks of the download, not of the installation, for a repository being downloaded', () => {
    expect(finishedMessage(task({ kind: 'skill.clone', status: 'succeeded' }))).toMatchObject({ title: 'paperasse is downloaded', route: '/skills', failed: false })
    expect(finishedMessage(task({ kind: 'skill.clone', status: 'failed', error: 'could not download the repository: fatal: not found' }))).toMatchObject({
      title: 'Downloading paperasse failed',
      failed: true
    })
  })
})
