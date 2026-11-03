export type TokenActivityDay = {
  date: string
  input_tokens: number
  output_tokens: number
  cache_tokens: number
}

export type TokenActivity = {
  today: string
  days: TokenActivityDay[]
}

export type ActivityCell = { date: string; tokens: number; level: 0 | 1 | 2 | 3 | 4 }
export type ActivityWeek = { start: string; cells: (ActivityCell | null)[]; tokens: number }
export type MonthLabel = { column: number; label: string }

const WEEKS = 53
const DAY_MS = 86_400_000

const MONTH = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })
const MONTH_DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Dates stay in UTC here: they are calendar days, and a local zone would move them across midnight. */
function toUTC(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function toDate(utc: number): string {
  return new Date(utc).toISOString().slice(0, 10)
}

export function totalTokens(day: Pick<TokenActivityDay, 'input_tokens' | 'output_tokens' | 'cache_tokens'>): number {
  return day.input_tokens + day.output_tokens + day.cache_tokens
}

/** 950, 12.4K, 34.9M, 1.2B: the size is what a reader wants, not the digits. */
export function formatTokens(tokens: number): string {
  if (tokens < 1_000) return String(tokens)
  for (const [limit, suffix] of [[1_000_000, 'K'], [1_000_000_000, 'M'], [Infinity, 'B']] as const) {
    if (tokens < limit) {
      const scaled = tokens / (suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : 1_000_000_000)
      return `${scaled >= 100 ? Math.round(scaled) : Number(scaled.toFixed(1))}${suffix}`
    }
  }
  return String(tokens)
}

export function formatDay(date: string): string {
  return MONTH_DAY.format(toUTC(date))
}

/**
 * Four steps cut at the quartiles of the days that were used. Use is lopsided: on a scale from zero to the busiest day,
 * one heavy day would leave every other day in the faintest step.
 */
function levelsFor(values: number[]): (tokens: number) => ActivityCell['level'] {
  const used = values.filter((value) => value > 0).sort((a, b) => a - b)
  const cut = (share: number) => used[Math.floor((used.length - 1) * share)]
  const [low, middle, high] = used.length ? [cut(0.25), cut(0.5), cut(0.75)] : [0, 0, 0]
  return (tokens) => {
    if (tokens <= 0) return 0
    if (tokens <= low) return 1
    if (tokens <= middle) return 2
    if (tokens <= high) return 3
    return 4
  }
}

/** The 53 weeks up to the one holding today, Sunday first. Days after today are empty slots. */
export function buildWeeks(activity: TokenActivity): ActivityWeek[] {
  const byDate = new Map(activity.days.map((day) => [day.date, totalTokens(day)]))
  const today = toUTC(activity.today)
  const firstSunday = today - new Date(today).getUTCDay() * DAY_MS - (WEEKS - 1) * 7 * DAY_MS

  const inRange: number[] = []
  for (let at = firstSunday; at <= today; at += DAY_MS) inRange.push(byDate.get(toDate(at)) ?? 0)
  const level = levelsFor(inRange)

  const weeks: ActivityWeek[] = []
  for (let week = 0; week < WEEKS; week++) {
    const start = firstSunday + week * 7 * DAY_MS
    let tokens = 0
    const cells: (ActivityCell | null)[] = []
    for (let day = 0; day < 7; day++) {
      const at = start + day * DAY_MS
      if (at > today) {
        cells.push(null)
        continue
      }
      const date = toDate(at)
      const spent = byDate.get(date) ?? 0
      tokens += spent
      cells.push({ date, tokens: spent, level: level(spent) })
    }
    weeks.push({ start: toDate(start), cells, tokens })
  }
  return weeks
}

/** A label over the first full week of each month, skipped when it would run into the next one. */
export function monthLabels(weeks: ActivityWeek[]): MonthLabel[] {
  const labels: MonthLabel[] = []
  let previousMonth = -1
  weeks.forEach((week, column) => {
    const start = new Date(toUTC(week.start))
    const month = start.getUTCMonth()
    if (month === previousMonth) return
    previousMonth = month
    // The first column can start at the very end of a month: its label would sit on top of the next.
    if (column === 0 && start.getUTCDate() > 21) return
    labels.push({ column, label: MONTH.format(start) })
  })
  return labels
}

/** The running total at the end of each week. */
export function cumulative(weeks: ActivityWeek[]): number[] {
  let running = 0
  return weeks.map((week) => (running += week.tokens))
}

export function activitySummary(weeks: ActivityWeek[]): { total: number; activeDays: number } {
  let total = 0
  let activeDays = 0
  for (const week of weeks) {
    for (const cell of week.cells) {
      if (!cell) continue
      total += cell.tokens
      if (cell.tokens > 0) activeDays++
    }
  }
  return { total, activeDays }
}
