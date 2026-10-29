import { describe, expect, it } from 'vitest'
import { formatThinkingDuration, keepNewestDurations, thinkingKey } from './thinkingTime'

describe('formatThinkingDuration', () => {
  it('writes seconds, then minutes and seconds, then hours and minutes', () => {
    expect(formatThinkingDuration(0)).toBe('0s')
    expect(formatThinkingDuration(7.9)).toBe('7s')
    expect(formatThinkingDuration(59)).toBe('59s')
    expect(formatThinkingDuration(60)).toBe('1m 00s')
    expect(formatThinkingDuration(125)).toBe('2m 05s')
    expect(formatThinkingDuration(3720)).toBe('1h 02m')
  })

  it('never goes below zero', () => {
    expect(formatThinkingDuration(-5)).toBe('0s')
  })
})

describe('thinkingKey', () => {
  it('is the same for the same thought and differs by text and by session', () => {
    expect(thinkingKey('s1', 'abc')).toBe(thinkingKey('s1', 'abc'))
    expect(thinkingKey('s1', 'abc')).not.toBe(thinkingKey('s1', 'abd'))
    expect(thinkingKey('s1', 'abc')).not.toBe(thinkingKey('s2', 'abc'))
    expect(thinkingKey(undefined, 'abc')).toBe(thinkingKey(undefined, 'abc'))
  })

  it('tells a thought from the same thought with more written after it', () => {
    expect(thinkingKey('s', 'first part')).not.toBe(thinkingKey('s', 'first part, and more'))
  })
})

describe('keepNewestDurations', () => {
  it('keeps everything under the limit, untouched', () => {
    const durations = { a: 1, b: 2 }
    expect(keepNewestDurations(durations, 5)).toBe(durations)
  })

  it('drops the oldest keys over the limit', () => {
    expect(keepNewestDurations({ a: 1, b: 2, c: 3, d: 4 }, 2)).toEqual({ c: 3, d: 4 })
  })
})
