import { describe, expect, it } from 'vitest'
import type { AutomationRun } from '@renderer/components/config/automation/automationTypes'
import { runDuration, runStatusLabel, sortRuns } from './runFormatting'

function run(overrides: Partial<AutomationRun>): AutomationRun {
  return { id: 'r', job_id: 'j', status: 'completed', ...overrides }
}

describe('sortRuns', () => {
  it('puts the most recent run first, using the best timestamp available', () => {
    const runs = [
      run({ id: 'old', started_at: '2026-01-01T10:00:00Z' }),
      run({ id: 'queued', queued_at: '2026-03-01T10:00:00Z' }),
      run({ id: 'mid', started_at: '2026-02-01T10:00:00Z' })
    ]
    expect(sortRuns(runs).map((item) => item.id)).toEqual(['queued', 'mid', 'old'])
  })

  it('does not mutate its input', () => {
    const runs = [run({ id: 'a', started_at: '2026-01-01T00:00:00Z' }), run({ id: 'b', started_at: '2026-02-01T00:00:00Z' })]
    sortRuns(runs)
    expect(runs.map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('runDuration', () => {
  it('formats seconds and minutes', () => {
    expect(runDuration(run({ started_at: '2026-01-01T10:00:00Z', finished_at: '2026-01-01T10:00:42Z' }))).toBe('42s')
    expect(runDuration(run({ started_at: '2026-01-01T10:00:00Z', finished_at: '2026-01-01T10:01:05Z' }))).toBe('1m 05s')
  })

  it('is null until the run has started and finished', () => {
    expect(runDuration(run({ started_at: '2026-01-01T10:00:00Z' }))).toBeNull()
    expect(runDuration(run({}))).toBeNull()
  })
})

describe('runStatusLabel', () => {
  it('labels known statuses and passes unknown ones through', () => {
    expect(runStatusLabel('failed')).toBe('Failed')
    expect(runStatusLabel('weird')).toBe('weird')
  })
})
