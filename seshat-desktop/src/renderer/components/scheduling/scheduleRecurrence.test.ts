import { describe, expect, it } from 'vitest'
import type { AutomationJob } from '@renderer/components/config/automation/automationTypes'
import { formatInterval, jobScheduleSummary, jobToRecurrence, nextOccurrences, recurrenceToJobFields } from './scheduleRecurrence'

function job(overrides: Partial<AutomationJob>): AutomationJob {
  return { id: 'j1', name: 'Test job', status: 'active', trigger_type: 'cron', ...overrides }
}

describe('recurrenceToJobFields', () => {
  it('encodes daily as a 5-field cron with * for day/month/weekday', () => {
    expect(recurrenceToJobFields({ kind: 'daily', time: '08:05', weekday: 0, dayOfMonth: 1, runAt: '', intervalMinutes: 60 }))
      .toEqual({ trigger_type: 'cron', cron_expr: '5 8 * * *' })
  })

  it('encodes weekly with the weekday in the 5th field', () => {
    expect(recurrenceToJobFields({ kind: 'weekly', time: '17:30', weekday: 3, dayOfMonth: 1, runAt: '', intervalMinutes: 60 }))
      .toEqual({ trigger_type: 'cron', cron_expr: '30 17 * * 3' })
  })

  it('encodes monthly with the day-of-month in the 3rd field', () => {
    expect(recurrenceToJobFields({ kind: 'monthly', time: '09:00', weekday: 0, dayOfMonth: 18, runAt: '', intervalMinutes: 60 }))
      .toEqual({ trigger_type: 'cron', cron_expr: '0 9 18 * *' })
  })

  it('encodes once as trigger_type "once" with an ISO run_at', () => {
    const result = recurrenceToJobFields({ kind: 'once', time: '', weekday: 0, dayOfMonth: 1, runAt: '2026-10-18T08:00', intervalMinutes: 60 })
    expect(result.trigger_type).toBe('once')
    expect(result.run_at).toBe(new Date('2026-10-18T08:00').toISOString())
  })
})

describe('jobToRecurrence', () => {
  it('round-trips daily/weekly/monthly cron back to the same recurrence shape', () => {
    expect(jobToRecurrence(job({ trigger_type: 'cron', cron_expr: '5 8 * * *' }))).toMatchObject({ kind: 'daily', time: '08:05' })
    expect(jobToRecurrence(job({ trigger_type: 'cron', cron_expr: '30 17 * * 3' }))).toMatchObject({ kind: 'weekly', time: '17:30', weekday: 3 })
    expect(jobToRecurrence(job({ trigger_type: 'cron', cron_expr: '0 9 18 * *' }))).toMatchObject({ kind: 'monthly', time: '09:00', dayOfMonth: 18 })
  })

  it('returns null for cron this picker cannot express (e.g. a month restriction)', () => {
    expect(jobToRecurrence(job({ trigger_type: 'cron', cron_expr: '0 9 1 6 *' }))).toBeNull()
  })

  it('returns null for webhook triggers, which the picker cannot express', () => {
    expect(jobToRecurrence(job({ trigger_type: 'webhook' }))).toBeNull()
  })
})

describe('nextOccurrences', () => {
  it('returns nothing for a paused job', () => {
    expect(nextOccurrences(job({ status: 'paused', trigger_type: 'cron', cron_expr: '0 9 * * *' }), 3)).toEqual([])
  })

  it('projects daily occurrences one day apart, starting from the next firing after `from`', () => {
    const from = new Date('2026-10-18T10:00:00')
    const occurrences = nextOccurrences(job({ trigger_type: 'cron', cron_expr: '0 9 * * *' }), 3, from)
    expect(occurrences).toHaveLength(3)
    expect(occurrences[0].getDate()).toBe(19)
    expect(occurrences[0].getHours()).toBe(9)
    expect(occurrences[0].getMinutes()).toBe(0)
    expect(occurrences[1].getDate()).toBe(20)
    expect(occurrences[2].getDate()).toBe(21)
  })

  it('projects the same day if the daily time has not passed yet', () => {
    const from = new Date('2026-10-18T08:00:00')
    const occurrences = nextOccurrences(job({ trigger_type: 'cron', cron_expr: '0 9 * * *' }), 1, from)
    expect(occurrences[0].getDate()).toBe(18)
  })

  it('projects monthly occurrences on the configured day, one month apart', () => {
    const from = new Date('2026-10-01T00:00:00')
    const occurrences = nextOccurrences(job({ trigger_type: 'cron', cron_expr: '0 8 18 * *' }), 3, from)
    expect(occurrences.map((d) => d.getMonth())).toEqual([9, 10, 11]) // Oct, Nov, Dec (0-indexed)
    expect(occurrences.every((d) => d.getDate() === 18)).toBe(true)
  })

  it('projects a single "once" occurrence only if it is still in the future', () => {
    const future = nextOccurrences(job({ trigger_type: 'once', run_at: '2026-12-25T00:00:00Z' }), 5, new Date('2026-01-01'))
    expect(future).toHaveLength(1)

    const past = nextOccurrences(job({ trigger_type: 'once', run_at: '2020-01-01T00:00:00Z' }), 5, new Date('2026-01-01'))
    expect(past).toHaveLength(0)
  })

  it('falls back to the backend-provided next_run_at for triggers this picker cannot project', () => {
    const occurrences = nextOccurrences(job({ trigger_type: 'interval', interval_seconds: 300, next_run_at: '2026-10-18T09:00:00Z' }), 5)
    expect(occurrences).toHaveLength(1)
  })
})

describe('interval triggers', () => {
  it('encodes minutes as interval_seconds', () => {
    expect(recurrenceToJobFields({ kind: 'interval', time: '', weekday: 0, dayOfMonth: 1, runAt: '', intervalMinutes: 30 }))
      .toEqual({ trigger_type: 'interval', interval_seconds: 1800 })
  })

  it('parses interval_seconds back into minutes', () => {
    expect(jobToRecurrence(job({ trigger_type: 'interval', interval_seconds: 7200 }))).toMatchObject({ kind: 'interval', intervalMinutes: 120 })
  })

  it('falls back to next_run_at, since there is no clock to project from', () => {
    const next = '2099-01-01T10:00:00.000Z'
    expect(nextOccurrences(job({ trigger_type: 'interval', interval_seconds: 3600, next_run_at: next }), 5).map((d) => d.toISOString())).toEqual([next])
  })

  it('formats intervals in the largest whole unit', () => {
    expect(formatInterval(1)).toBe('minute')
    expect(formatInterval(45)).toBe('45 minutes')
    expect(formatInterval(60)).toBe('hour')
    expect(formatInterval(180)).toBe('3 hours')
    expect(formatInterval(1440)).toBe('day')
  })
})

describe('jobScheduleSummary', () => {
  it('describes a saved webhook job (empty trigger_type plus a token)', () => {
    expect(jobScheduleSummary(job({ trigger_type: '', webhook_token: 'abc', webhook_method: 'PUT' }))).toBe('Triggered by webhook (PUT)')
  })

  it('describes an interval job', () => {
    expect(jobScheduleSummary(job({ trigger_type: 'interval', interval_seconds: 1800 }))).toBe('Repeat every 30 minutes')
  })
})
