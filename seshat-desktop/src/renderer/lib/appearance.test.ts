import { describe, expect, it } from 'vitest'
import { CONTENT_WIDTHS, DEFAULT_APPEARANCE, SPACINGS, TEXT_SIZES, ZOOMS, appearanceVars, parseAppearance } from './appearance'

describe('parseAppearance', () => {
  it('returns the defaults for nothing, for junk and for another type', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(parseAppearance('large')).toEqual(DEFAULT_APPEARANCE)
    expect(parseAppearance({ textSize: 'huge', zoom: 333, spacing: 'x', contentWidth: 1 })).toEqual(DEFAULT_APPEARANCE)
  })

  it('keeps every valid step', () => {
    const prefs = { textSize: 'xlarge', zoom: 125, spacing: 'spacious', contentWidth: 'wide' }
    expect(parseAppearance(prefs)).toEqual(prefs)
  })

  it('replaces only the invalid field', () => {
    expect(parseAppearance({ textSize: 'large', zoom: 7 })).toEqual({ ...DEFAULT_APPEARANCE, textSize: 'large' })
  })
})

describe('appearanceVars', () => {
  it('writes px values for the layout variables', () => {
    expect(appearanceVars(DEFAULT_APPEARANCE)).toEqual({
      '--chat-font-size': '14px',
      '--message-gap': '36px',
      '--list-item-pad-y': '6px',
      '--chat-max-width': '900px'
    })
  })

  it('keeps the steps ordered, so "larger" is always larger', () => {
    const px = TEXT_SIZES.map((option) => option.px)
    expect(px).toEqual([...px].sort((a, b) => a - b))
    const gaps = SPACINGS.map((option) => option.messageGap)
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b))
    const widths = CONTENT_WIDTHS.map((option) => option.px)
    expect(widths).toEqual([...widths].sort((a, b) => a - b))
    expect(ZOOMS).toEqual([...ZOOMS].sort((a, b) => a - b))
    expect(ZOOMS).toContain(100)
  })

  it('has the default step among each list', () => {
    expect(TEXT_SIZES.map((o) => o.value)).toContain(DEFAULT_APPEARANCE.textSize)
    expect(SPACINGS.map((o) => o.value)).toContain(DEFAULT_APPEARANCE.spacing)
    expect(CONTENT_WIDTHS.map((o) => o.value)).toContain(DEFAULT_APPEARANCE.contentWidth)
  })
})
