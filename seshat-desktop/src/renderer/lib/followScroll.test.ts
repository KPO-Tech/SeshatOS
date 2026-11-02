import { describe, expect, it } from 'vitest'
import { followAfterScroll } from './followScroll'

describe('followAfterScroll', () => {
  it('keeps following when the content outgrew the chat own scroll', () => {
    expect(followAfterScroll(true, { top: 900, lastTop: 800, distance: 400 })).toBe(true)
  })

  it('keeps following after the jump of the button, which lands short of the end', () => {
    expect(followAfterScroll(true, { top: 5000, lastTop: 1000, distance: 1200 })).toBe(true)
  })

  it('stops when the reader moves up', () => {
    expect(followAfterScroll(true, { top: 700, lastTop: 800, distance: 300 })).toBe(false)
  })

  it('keeps following on a small move up near the end: the content shrank, or the wheel handler decides', () => {
    expect(followAfterScroll(true, { top: 790, lastTop: 800, distance: 10 })).toBe(true)
  })

  it('starts again when the reader comes back down to the end, not before', () => {
    expect(followAfterScroll(false, { top: 900, lastTop: 800, distance: 300 })).toBe(false)
    expect(followAfterScroll(false, { top: 1150, lastTop: 900, distance: 40 })).toBe(true)
  })

  it('does not start again on a move up near the end', () => {
    expect(followAfterScroll(false, { top: 790, lastTop: 800, distance: 10 })).toBe(false)
  })
})
