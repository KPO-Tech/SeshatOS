import { describe, expect, it } from 'vitest'
import { createTurnTimer, formatDuration } from './turnTiming'

describe('createTurnTimer', () => {
  it('measures the first output and the whole turn', () => {
    let t = 1000
    const timer = createTurnTimer(() => t)
    t = 1850
    timer.markFirstOutput()
    t = 2000
    timer.markFirstOutput() // only the first counts
    t = 5200
    expect(timer.finish()).toEqual({ ttftMs: 850, durationMs: 4200 })
  })

  it('has no first output when the turn wrote nothing', () => {
    let t = 0
    const timer = createTurnTimer(() => t)
    t = 300
    expect(timer.finish()).toEqual({ ttftMs: null, durationMs: 300 })
  })
})

describe('formatDuration', () => {
  it('picks the unit', () => {
    expect(formatDuration(850)).toBe('850 ms')
    expect(formatDuration(4200)).toBe('4.2 s')
    expect(formatDuration(75_000)).toBe('1 min 15 s')
  })
})
