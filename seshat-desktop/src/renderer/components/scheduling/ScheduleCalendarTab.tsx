import { useMemo, useState } from 'react'
import type { AutomationJob } from '@renderer/components/config/automation/automationTypes'
import { nextOccurrences } from './scheduleRecurrence'

type Occurrence = { job: AutomationJob; date: Date }

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_DAILY_LOOKAHEAD = 45 // enough occurrences for a daily job to cover a full grid (6 weeks) plus slack

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function ScheduleCalendarTab({ jobs, onOpenJob }: { jobs: AutomationJob[]; onOpenJob: (job: AutomationJob) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [view, setView] = useState<'grid' | 'agenda'>('grid')

  // Every job's occurrences from the start of the visible month onward -
  // one shared computation feeds both the grid (bucketed per day) and the
  // agenda (flattened and sorted) so navigating/toggling never re-derives
  // from scratch differently between the two.
  const occurrences = useMemo<Occurrence[]>(() => {
    const from = startOfMonth(month)
    const result: Occurrence[] = []
    for (const job of jobs) {
      for (const date of nextOccurrences(job, MAX_DAILY_LOOKAHEAD, from)) {
        result.push({ job, date })
      }
    }
    return result.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [jobs, month])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="flex size-8 items-center justify-center rounded-md border border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="Previous month">
            <ChevronIcon direction="left" />
          </button>
          <h2 className="min-w-[130px] text-center text-[15px] font-semibold text-[var(--text-primary)]">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
          <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="flex size-8 items-center justify-center rounded-md border border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" aria-label="Next month">
            <ChevronIcon direction="right" />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setMonth(startOfMonth(new Date()))} className="h-8 rounded-md border border-[var(--border-soft)] px-3 text-[12.5px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
            Today
          </button>
          <div className="flex items-center gap-0.5 rounded-md border border-[var(--border-soft)] p-0.5">
            <button type="button" onClick={() => setView('grid')} aria-label="Grid view" className={['flex size-7 items-center justify-center rounded', view === 'grid' ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'].join(' ')}>
              <GridIcon />
            </button>
            <button type="button" onClick={() => setView('agenda')} aria-label="Agenda view" className={['flex size-7 items-center justify-center rounded', view === 'agenda' ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)]'].join(' ')}>
              <ListIcon />
            </button>
          </div>
        </div>
      </div>

      {view === 'grid' ? <MonthGrid month={month} occurrences={occurrences} onOpenJob={onOpenJob} /> : <Agenda occurrences={occurrences} onOpenJob={onOpenJob} />}
    </div>
  )
}

function MonthGrid({ month, occurrences, onOpenJob }: { month: Date; occurrences: Occurrence[]; onOpenJob: (job: AutomationJob) => void }) {
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const occurrence of occurrences) {
      const key = dateKey(occurrence.date)
      const bucket = map.get(key)
      if (bucket) bucket.push(occurrence)
      else map.set(key, [occurrence])
    }
    return map
  }, [occurrences])

  const days = useMemo(() => {
    const firstOfMonth = startOfMonth(month)
    const gridStart = new Date(firstOfMonth)
    gridStart.setDate(gridStart.getDate() - firstOfMonth.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + i)
      return date
    })
  }, [month])

  const today = dateKey(new Date())

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border-soft)]">
      <div className="grid grid-cols-7 border-b border-[var(--border-soft)]">
        {DAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
        ))}
      </div>
      <div className="no-scrollbar grid flex-1 grid-cols-7 auto-rows-fr overflow-y-auto">
        {days.map((date) => {
          const items = byDay.get(dateKey(date)) ?? []
          const inMonth = date.getMonth() === month.getMonth()
          return (
            <div key={date.toISOString()} className={['min-h-[92px] border-b border-r border-[var(--border-soft)] p-1.5', inMonth ? '' : 'opacity-40'].join(' ')}>
              <div className={['text-[11px] font-semibold', dateKey(date) === today ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'].join(' ')}>
                {date.getDate()}
              </div>
              <div className="mt-1 grid gap-1">
                {items.slice(0, 2).map((occurrence, index) => (
                  <button
                    key={`${occurrence.job.id}-${index}`}
                    type="button"
                    onClick={() => onOpenJob(occurrence.job)}
                    className="truncate rounded bg-[var(--accent-primary)]/12 px-1.5 py-0.5 text-left text-[10.5px] font-semibold text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20"
                    title={`${occurrence.job.name} - ${occurrence.date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
                  >
                    {occurrence.job.name}
                  </button>
                ))}
                {items.length > 2 && <span className="px-1.5 text-[10px] text-[var(--text-muted)]">+{items.length - 2} more</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Agenda({ occurrences, onOpenJob }: { occurrences: Occurrence[]; onOpenJob: (job: AutomationJob) => void }) {
  const now = new Date()
  const todayKey = dateKey(now)
  const upcoming = occurrences.filter((occurrence) => occurrence.date >= now).slice(0, 20)
  const today = upcoming.filter((occurrence) => dateKey(occurrence.date) === todayKey)
  const later = upcoming.filter((occurrence) => dateKey(occurrence.date) !== todayKey)

  const groups = useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const occurrence of later) {
      const key = dateKey(occurrence.date)
      const bucket = map.get(key)
      if (bucket) bucket.push(occurrence)
      else map.set(key, [occurrence])
    }
    return [...map.entries()]
  }, [later])

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-4 pb-8">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
            <span className="size-1.5 rounded-full bg-[var(--accent-primary)]" /> Today
          </div>
          {today.length === 0 ? (
            <p className="pl-3.5 text-[12.5px] text-[var(--text-muted)]">No tasks running today</p>
          ) : (
            <div className="grid gap-1.5 pl-3.5">
              {today.map((occurrence, index) => <AgendaRow key={`${occurrence.job.id}-${index}`} occurrence={occurrence} onOpenJob={onOpenJob} />)}
            </div>
          )}
        </div>

        {groups.length > 0 && (
          <div>
            <div className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Upcoming</div>
            <div className="grid gap-3 pl-3.5">
              {groups.map(([key, items]) => (
                <div key={key}>
                  <div className="mb-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
                    {items[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="grid gap-1.5">
                    {items.map((occurrence, index) => <AgendaRow key={`${occurrence.job.id}-${index}`} occurrence={occurrence} onOpenJob={onOpenJob} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AgendaRow({ occurrence, onOpenJob }: { occurrence: Occurrence; onOpenJob: (job: AutomationJob) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenJob(occurrence.job)}
      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3.5 py-2.5 text-left hover:bg-[var(--surface-muted)]"
    >
      <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-primary)]">{occurrence.job.name}</span>
      <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{occurrence.date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
    </button>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direction === 'left' ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}
    </svg>
  )
}

function GridIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
}

function ListIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
}
