import { describe, expect, it } from 'vitest'
import { homeTime } from './homeTime'

// Dates are built from their parts, so the test holds in any time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString()
const now = new Date(2026, 9, 31, 15, 0).getTime()

describe('homeTime', () => {
  it('says today and yesterday with the time', () => {
    expect(homeTime(at(2026, 10, 31, 14, 32), now)).toBe('Today, 14:32')
    expect(homeTime(at(2026, 10, 30, 18, 4), now)).toBe('Yesterday, 18:04')
  })

  it('gives the date for older ones, with the year only when it is not this one', () => {
    expect(homeTime(at(2026, 10, 28, 9, 12), now)).toBe('Oct 28, 09:12')
    expect(homeTime(at(2025, 12, 3, 7, 5), now)).toBe('Dec 3 2025, 07:05')
  })

  it('gives nothing for a missing or unreadable date', () => {
    expect(homeTime(null, now)).toBe('')
    expect(homeTime('nope', now)).toBe('')
  })
})
