import { describe, expect, it } from 'vitest'
import { activitySummary, buildWeeks, cumulative, formatDay, formatTokens, monthLabels, totalTokens } from './tokenActivity'

const day = (date: string, input: number, output = 0, cache = 0) => ({ date, input_tokens: input, output_tokens: output, cache_tokens: cache })

describe('formatTokens', () => {
  it('gives the size and not the digits', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(12_400)).toBe('12.4K')
    expect(formatTokens(999_999)).toBe('1000K')
    expect(formatTokens(34_900_000)).toBe('34.9M')
    expect(formatTokens(1_200_000_000)).toBe('1.2B')
    expect(formatTokens(250_000_000)).toBe('250M')
  })
})

describe('buildWeeks', () => {
  // A Tuesday.
  const today = '2026-11-03'

  it('ends on the week of today, Sunday first, and leaves the days to come empty', () => {
    const weeks = buildWeeks({ today, days: [] })
    expect(weeks).toHaveLength(53)
    const last = weeks[52]
    expect(last.start).toBe('2026-11-01')
    expect(last.cells[2]?.date).toBe(today)
    expect(last.cells[3]).toBeNull()
    expect(weeks[0].cells.every(Boolean)).toBe(true)
  })

  it('keeps a date on its day whatever the machine zone', () => {
    expect(formatDay('2026-05-22')).toBe('May 22')
    const cells = buildWeeks({ today, days: [day('2026-05-22', 5)] }).flatMap((week) => week.cells)
    expect(cells.find((cell) => cell?.date === '2026-05-22')?.tokens).toBe(5)
  })

  it('counts input, output and cache', () => {
    expect(totalTokens(day('2026-05-22', 1, 2, 3))).toBe(6)
  })

  it('leaves room below one heavy day instead of washing out the others', () => {
    const days = [day('2026-10-01', 10), day('2026-10-02', 20), day('2026-10-03', 30), day('2026-10-04', 40), day('2026-10-05', 1_000_000)]
    const cells = buildWeeks({ today, days }).flatMap((week) => week.cells)
    const levelOf = (date: string) => cells.find((cell) => cell?.date === date)?.level
    expect(levelOf('2026-10-01')).toBe(1)
    expect(levelOf('2026-10-03')).toBe(2)
    expect(levelOf('2026-10-04')).toBe(3)
    expect(levelOf('2026-10-05')).toBe(4)
    expect(levelOf('2026-10-06')).toBe(0)
  })

  it('ignores days older than the grid', () => {
    const weeks = buildWeeks({ today, days: [day('2020-01-01', 99), day('2026-10-01', 1)] })
    expect(activitySummary(weeks)).toEqual({ total: 1, activeDays: 1 })
  })

  it('shows nothing used when there is nothing', () => {
    const weeks = buildWeeks({ today, days: [] })
    expect(activitySummary(weeks)).toEqual({ total: 0, activeDays: 0 })
    expect(weeks.flatMap((week) => week.cells).every((cell) => !cell || cell.level === 0)).toBe(true)
  })
})

describe('weekly and cumulative views', () => {
  const today = '2026-11-03'

  it('adds up the days of a week', () => {
    const weeks = buildWeeks({ today, days: [day('2026-10-25', 1), day('2026-10-31', 2), day('2026-11-01', 4)] })
    expect(weeks[51].tokens).toBe(3)
    expect(weeks[52].tokens).toBe(4)
  })

  it('only ever goes up, and ends on the total', () => {
    const weeks = buildWeeks({ today, days: [day('2026-10-25', 1), day('2026-11-01', 4)] })
    const running = cumulative(weeks)
    expect(running.every((value, index) => index === 0 || value >= running[index - 1])).toBe(true)
    expect(running[52]).toBe(activitySummary(weeks).total)
  })
})

describe('monthLabels', () => {
  it('names each month once, from left to right', () => {
    const labels = monthLabels(buildWeeks({ today: '2026-11-03', days: [] }))
    const names = labels.map((label) => label.label)
    expect(new Set(names.slice(1, -1)).size).toBe(names.length - 2)
    expect(labels.every((label, index) => index === 0 || label.column > labels[index - 1].column)).toBe(true)
    expect(names.at(-1)).toBe('Nov')
  })

  it('does not put the label of a month that is ending against the next one', () => {
    // The grid of 2026-11-03 starts on 2025-10-26.
    const labels = monthLabels(buildWeeks({ today: '2026-11-03', days: [] }))
    expect(labels[0].label).toBe('Nov')
  })
})
