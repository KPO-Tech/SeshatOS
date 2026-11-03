import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '@renderer/api/client'
import { SettingsCard } from './kit'
import {
  activitySummary,
  buildWeeks,
  cumulative,
  formatDay,
  formatTokens,
  monthLabels,
  type ActivityCell,
  type ActivityWeek,
  type TokenActivity
} from './tokenActivity'

type View = 'daily' | 'weekly' | 'cumulative'
const VIEWS: { id: View; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'cumulative', label: 'Cumulative' }
]

const CHART_HEIGHT = 132

/** One hue from faint to full, mixed with the card's own surface so it holds in every theme. */
const LEVEL_FILL: Record<ActivityCell['level'], string> = {
  0: 'var(--surface-muted)',
  1: 'color-mix(in srgb, var(--accent-primary) 30%, var(--surface-panel))',
  2: 'color-mix(in srgb, var(--accent-primary) 50%, var(--surface-panel))',
  3: 'color-mix(in srgb, var(--accent-primary) 75%, var(--surface-panel))',
  4: 'var(--accent-primary)'
}

type Tip = { x: number; y: number; title: string; value: string }

/** The tooltip, kept inside the chart at both ends. */
function ChartTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  const edge = tip.x < 12 ? 'translateX(0)' : tip.x > 88 ? 'translateX(-100%)' : 'translateX(-50%)'
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-2.5 py-1.5 text-[12px] shadow-lg"
      style={{ left: `${tip.x}%`, top: tip.y, transform: `${edge} translateY(calc(-100% - 6px))` }}
    >
      <div className="text-[var(--text-muted)]">{tip.title}</div>
      <div className="font-medium text-[var(--text-primary)]">{tip.value}</div>
    </div>
  )
}

function MonthAxis({ weeks }: { weeks: ActivityWeek[] }) {
  const labels = useMemo(() => monthLabels(weeks), [weeks])
  return (
    <div className="relative mt-2 h-4 text-[11px] text-[var(--text-muted)]" aria-hidden>
      {labels.map((label) => (
        <span key={label.column} className="absolute" style={{ left: `${(label.column / weeks.length) * 100}%` }}>
          {label.label}
        </span>
      ))}
    </div>
  )
}

function DailyGrid({ weeks }: { weeks: ActivityWeek[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <ChartTip tip={tip} />
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week, column) => (
          <div key={week.start} className="grid gap-[3px]">
            {week.cells.map((cell, row) => (
              <div
                key={row}
                className="aspect-square rounded-[3px]"
                style={{ background: cell ? LEVEL_FILL[cell.level] : 'transparent' }}
                onMouseEnter={(event) => {
                  if (!cell) return setTip(null)
                  const box = event.currentTarget
                  setTip({
                    x: ((column + 0.5) / weeks.length) * 100,
                    y: box.offsetTop,
                    title: formatDay(cell.date),
                    value: cell.tokens ? `${formatTokens(cell.tokens)} tokens` : 'No tokens'
                  })
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function WeeklyBars({ weeks }: { weeks: ActivityWeek[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const peak = Math.max(1, ...weeks.map((week) => week.tokens))
  return (
    <div className="relative" style={{ height: CHART_HEIGHT }} onMouseLeave={() => setTip(null)}>
      <ChartTip tip={tip} />
      <div className="absolute inset-x-0 bottom-0 border-t border-[var(--border-soft)]" />
      <div className="flex h-full items-end gap-[2px]">
        {weeks.map((week, column) => {
          const height = (week.tokens / peak) * (CHART_HEIGHT - 8)
          return (
            <div
              key={week.start}
              className="flex h-full min-w-0 flex-1 items-end"
              onMouseEnter={() =>
                setTip({
                  x: ((column + 0.5) / weeks.length) * 100,
                  y: CHART_HEIGHT - height,
                  title: `Week of ${formatDay(week.start)}`,
                  value: week.tokens ? `${formatTokens(week.tokens)} tokens` : 'No tokens'
                })
              }
            >
              <div className="w-full rounded-t-[3px] bg-[var(--accent-primary)]" style={{ height: week.tokens ? Math.max(2, height) : 0 }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CumulativeLine({ weeks }: { weeks: ActivityWeek[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const running = useMemo(() => cumulative(weeks), [weeks])
  const peak = Math.max(1, running[running.length - 1] ?? 1)
  const xOf = (index: number) => (index / Math.max(1, running.length - 1)) * 100
  const yOf = (value: number) => CHART_HEIGHT - 4 - (value / peak) * (CHART_HEIGHT - 8)
  const line = running.map((value, index) => `${xOf(index)},${yOf(value)}`).join(' ')
  const tip: Tip | null =
    hovered === null
      ? null
      : {
          x: xOf(hovered),
          y: yOf(running[hovered]),
          title: `Through the week of ${formatDay(weeks[hovered].start)}`,
          value: `${formatTokens(running[hovered])} tokens`
        }

  return (
    <div
      className="relative"
      style={{ height: CHART_HEIGHT }}
      onMouseLeave={() => setHovered(null)}
      onMouseMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        const share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
        setHovered(Math.round(share * (running.length - 1)))
      }}
    >
      <ChartTip tip={tip} />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 100 ${CHART_HEIGHT}`} preserveAspectRatio="none" aria-hidden>
        <polygon points={`0,${CHART_HEIGHT} ${line} 100,${CHART_HEIGHT}`} style={{ fill: 'var(--accent-primary)', fillOpacity: 0.12 }} />
        <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinejoin="round" style={{ stroke: 'var(--accent-primary)' }} />
        {hovered !== null && (
          <line x1={xOf(hovered)} x2={xOf(hovered)} y1={0} y2={CHART_HEIGHT} vectorEffect="non-scaling-stroke" strokeWidth={1} style={{ stroke: 'var(--border-strong, var(--text-muted))' }} />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 border-t border-[var(--border-soft)]" />
    </div>
  )
}

function ViewTabs({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <div className="flex items-center gap-3" role="tablist" aria-label="Token activity view">
      {VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={view === item.id}
          onClick={() => onChange(item.id)}
          className={`cursor-pointer border-0 bg-transparent p-0 text-[13px] ${view === item.id ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function LevelLegend() {
  return (
    <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]" aria-hidden>
      <span className="mr-0.5">Less</span>
      {([0, 1, 2, 3, 4] as const).map((level) => (
        <span key={level} className="size-2.5 rounded-[2px]" style={{ background: LEVEL_FILL[level] }} />
      ))}
      <span className="ml-0.5">More</span>
    </div>
  )
}

/** The same numbers for a screen reader, week by week: the charts above are drawn for the eye. */
function WeeksTable({ weeks }: { weeks: ActivityWeek[] }) {
  return (
    <table className="sr-only">
      <caption>Tokens used per week</caption>
      <thead>
        <tr>
          <th>Week of</th>
          <th>Tokens</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week.start}>
            <td>{formatDay(week.start)}</td>
            <td>{week.tokens}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** How many tokens this person used, day by day, over the last year. */
export function TokenActivityCard() {
  const [activity, setActivity] = useState<TokenActivity | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('daily')

  useEffect(() => {
    const controller = new AbortController()
    api
      .get<TokenActivity>('/account/token-activity', controller.signal)
      .then(setActivity)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [])

  const weeks = useMemo(() => (activity ? buildWeeks(activity) : null), [activity])

  let body: ReactNode
  if (failed) {
    body = <p className="m-0 text-[13px] text-[var(--text-muted)]">Token activity could not be loaded.</p>
  } else if (!weeks) {
    body = <div style={{ height: CHART_HEIGHT }} aria-busy />
  } else {
    const { total, activeDays } = activitySummary(weeks)
    body = (
      <>
        {view === 'daily' && <DailyGrid weeks={weeks} />}
        {view === 'weekly' && <WeeklyBars weeks={weeks} />}
        {view === 'cumulative' && <CumulativeLine weeks={weeks} />}
        <MonthAxis weeks={weeks} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[12px] text-[var(--text-secondary)]">
            {total
              ? `${formatTokens(total)} tokens over ${activeDays} active ${activeDays === 1 ? 'day' : 'days'} in the last year`
              : 'No tokens used yet. Activity shows here once you chat with an agent.'}
          </p>
          {view === 'daily' && <LevelLegend />}
        </div>
        <WeeksTable weeks={weeks} />
      </>
    )
  }

  return (
    <SettingsCard title="Token activity" padded action={<ViewTabs view={view} onChange={setView} />}>
      {body}
    </SettingsCard>
  )
}
