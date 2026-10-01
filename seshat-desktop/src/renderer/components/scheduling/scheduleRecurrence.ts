import type { AutomationJob, AutomationJobParams } from '@renderer/components/config/automation/automationTypes'

// A friendlier layer over the backend's raw trigger_type/cron_expr/run_at -
// the same "Daily/Weekly/Monthly/Once + time" picker Manus's own scheduled
// tasks UI uses, instead of exposing a bare cron field. We only ever
// generate simple 5-field cron (minute hour * * *, etc.), so parsing our
// own output back out for editing is exact - anything else (hand-written
// cron, webhook triggers) just isn't editable via this picker and falls
// back to showing the raw trigger type. 'interval' (every N minutes) maps to
// the backend's interval trigger, which the calendar can't project on its own.
export type SimpleRecurrenceKind = 'daily' | 'weekly' | 'monthly' | 'once' | 'interval'

export type SimpleRecurrence = {
  kind: SimpleRecurrenceKind
  time: string // "HH:MM", 24h local - unused for 'once'
  weekday: number // 0 (Sun) - 6 (Sat) - used for 'weekly'
  dayOfMonth: number // 1-31 - used for 'monthly'
  runAt: string // datetime-local input value - used for 'once'
  intervalMinutes: number // used for 'interval'; the backend minimum is 60 seconds
}

export const MIN_INTERVAL_MINUTES = 1

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function defaultRecurrence(): SimpleRecurrence {
  const runAt = new Date(Date.now() + 60 * 60 * 1000)
  runAt.setMinutes(0, 0, 0)
  return {
    kind: 'daily',
    time: '09:00',
    weekday: runAt.getDay(),
    dayOfMonth: runAt.getDate(),
    runAt: toDatetimeLocal(runAt),
    intervalMinutes: 60
  }
}

export function toDatetimeLocal(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function recurrenceToJobFields(recurrence: SimpleRecurrence): Pick<AutomationJobParams, 'trigger_type' | 'cron_expr' | 'run_at' | 'interval_seconds'> {
  if (recurrence.kind === 'interval') {
    return { trigger_type: 'interval', interval_seconds: Math.max(MIN_INTERVAL_MINUTES, Math.round(recurrence.intervalMinutes)) * 60 }
  }
  if (recurrence.kind === 'once') {
    const date = new Date(recurrence.runAt)
    return { trigger_type: 'once', run_at: Number.isNaN(date.getTime()) ? undefined : date.toISOString() }
  }
  const [hh, mm] = recurrence.time.split(':').map((part) => Number(part) || 0)
  if (recurrence.kind === 'daily') return { trigger_type: 'cron', cron_expr: `${mm} ${hh} * * *` }
  if (recurrence.kind === 'weekly') return { trigger_type: 'cron', cron_expr: `${mm} ${hh} * * ${recurrence.weekday}` }
  return { trigger_type: 'cron', cron_expr: `${mm} ${hh} ${recurrence.dayOfMonth} * *` }
}

// Returns null when the job's trigger can't be expressed by this picker
// (custom cron, webhook) - callers fall back to a read-only summary of the
// raw trigger in that case.
export function jobToRecurrence(job: Pick<AutomationJob, 'trigger_type' | 'cron_expr' | 'run_at' | 'interval_seconds'>): SimpleRecurrence | null {
  const fallback = defaultRecurrence()
  if (job.trigger_type === 'interval' && job.interval_seconds) {
    return { ...fallback, kind: 'interval', intervalMinutes: Math.max(MIN_INTERVAL_MINUTES, Math.round(job.interval_seconds / 60)) }
  }
  if (job.trigger_type === 'once') {
    const date = job.run_at ? new Date(job.run_at) : null
    return { ...fallback, kind: 'once', runAt: date && !Number.isNaN(date.getTime()) ? toDatetimeLocal(date) : fallback.runAt }
  }
  if (job.trigger_type !== 'cron' || !job.cron_expr) return null
  const parts = job.cron_expr.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [mm, hh, dom, month, dow] = parts
  if (month !== '*' || !/^\d{1,2}$/.test(mm) || !/^\d{1,2}$/.test(hh)) return null
  const time = `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`
  if (dom === '*' && dow === '*') return { ...fallback, kind: 'daily', time }
  if (dom === '*' && /^[0-6]$/.test(dow)) return { ...fallback, kind: 'weekly', time, weekday: Number(dow) }
  if (dow === '*' && /^([1-9]|[12]\d|3[01])$/.test(dom)) return { ...fallback, kind: 'monthly', time, dayOfMonth: Number(dom) }
  return null
}

export function recurrenceSummary(recurrence: SimpleRecurrence): string {
  if (recurrence.kind === 'once') {
    const date = new Date(recurrence.runAt)
    return Number.isNaN(date.getTime()) ? 'Once' : `Once on ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${recurrence.time || date.toTimeString().slice(0, 5)}`
  }
  if (recurrence.kind === 'interval') return `Repeat every ${formatInterval(recurrence.intervalMinutes)}`
  if (recurrence.kind === 'daily') return `Repeat daily at ${recurrence.time}`
  if (recurrence.kind === 'weekly') return `Repeat weekly on ${WEEKDAY_LABELS[recurrence.weekday]} at ${recurrence.time}`
  return `Repeat monthly on ${ordinal(recurrence.dayOfMonth)} at ${recurrence.time}`
}

export function jobScheduleSummary(job: AutomationJob): string {
  const recurrence = jobToRecurrence(job)
  if (recurrence) return recurrenceSummary(recurrence)
  if (job.webhook_token || job.trigger_type === 'webhook') return `Triggered by webhook (${job.webhook_method || 'POST'})`
  return job.cron_expr ? `Cron: ${job.cron_expr}` : job.trigger_type || 'Manual'
}

export function formatInterval(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'day' : `${minutes / 1440} days`
  if (minutes % 60 === 0) return minutes === 60 ? 'hour' : `${minutes / 60} hours`
  return minutes === 1 ? 'minute' : `${minutes} minutes`
}

function ordinal(day: number) {
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${day}${suffix}`
}

// Projects the next `count` firing times for a job from `from` onward -
// used by both the calendar grid and the agenda list. Paused jobs and jobs
// whose trigger this picker can't parse (custom cron/interval/webhook) fall
// back to the single `next_run_at` the backend already computed, since we
// have no way to project those ourselves.
export function nextOccurrences(job: AutomationJob, count: number, from: Date = new Date()): Date[] {
  if (job.status !== 'active') return []
  const recurrence = jobToRecurrence(job)
  // Interval jobs (and anything the picker can't parse) only expose the one
  // next_run_at the backend computed - there is no fixed clock to project from.
  if (!recurrence || recurrence.kind === 'interval') {
    if (!job.next_run_at) return []
    const date = new Date(job.next_run_at)
    return Number.isNaN(date.getTime()) ? [] : [date]
  }

  if (recurrence.kind === 'once') {
    const date = new Date(recurrence.runAt)
    return Number.isNaN(date.getTime()) || date <= from ? [] : [date]
  }

  const [hh, mm] = recurrence.time.split(':').map((part) => Number(part) || 0)
  const results: Date[] = []
  const cursor = new Date(from)
  cursor.setSeconds(0, 0)

  if (recurrence.kind === 'daily') {
    cursor.setHours(hh, mm, 0, 0)
    if (cursor <= from) cursor.setDate(cursor.getDate() + 1)
    for (let i = 0; i < count; i++) {
      results.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
  } else if (recurrence.kind === 'weekly') {
    cursor.setHours(hh, mm, 0, 0)
    for (let guard = 0; guard < 8 && (cursor.getDay() !== recurrence.weekday || cursor <= from); guard++) {
      cursor.setDate(cursor.getDate() + 1)
    }
    for (let i = 0; i < count; i++) {
      results.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 7)
    }
  } else {
    cursor.setDate(recurrence.dayOfMonth)
    cursor.setHours(hh, mm, 0, 0)
    if (cursor <= from) cursor.setMonth(cursor.getMonth() + 1)
    for (let i = 0; i < count; i++) {
      results.push(new Date(cursor))
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }
  return results
}
