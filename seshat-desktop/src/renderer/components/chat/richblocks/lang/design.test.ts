import { describe, expect, it } from 'vitest'
import { checkDesign, DESIGN_LIMITS, readableOn, safeColor } from './design'
import { parseUi } from './parseUi'

const problems = (source: string) => parseUi(source, { streaming: false }).errors.map((error) => error.message)

describe('the colours of a design', () => {
  it('are hex codes, written in full and in lower case, and nothing else', () => {
    expect(safeColor('#3B82F6')).toBe('#3b82f6')
    expect(safeColor('#fa0')).toBe('#ffaa00')
    expect(safeColor('red')).toBeNull()
    expect(safeColor('#12345')).toBeNull()
    expect(safeColor('url(https://evil.example/x)')).toBeNull()
    expect(safeColor('#fff; background: url(x)')).toBeNull()
    expect(safeColor(12)).toBeNull()
  })

  it('give the text a colour that reads on them', () => {
    expect(readableOn('#ffffff')).toBe('#111827')
    expect(readableOn('#111827')).toBe('#ffffff')
    expect(readableOn('#f97316')).toBe('#111827')
    expect(readableOn('#1e3a8a')).toBe('#ffffff')
  })
})

describe('the pieces of a page', () => {
  it('are read without a complaint when they are well written', () => {
    const block = `root = Browser([Nav("Brand", ["A", "B"], "Go", "#f97316"), Hero("Title", "Sub", "Start", "More", "#3b82f6"), Features([Feature("One", "text", "ai", "#10b981")], 1), Grid([Picture("photo", "#8b5cf6", 1.5)], 2), Footer("2026", ["Terms"])], "https://a.example", "#fff")`
    expect(problems(block)).toEqual([])
  })

  it('are refused with a colour that is not a hex code', () => {
    expect(problems('root = Hero("T", null, null, null, "red")').some((message) => message.includes('"red" is not a colour'))).toBe(true)
    expect(problems('root = Palette([Swatch("javascript:alert(1)", "x")])').some((message) => message.includes('is not a colour'))).toBe(true)
  })

  it('are refused when there are too many items, swatches or links', () => {
    const features = Array.from({ length: DESIGN_LIMITS.features + 1 }, () => 'Feature("f")').join(', ')
    expect(problems(`root = Features([${features}])`).some((message) => message.includes('at most'))).toBe(true)
    const swatches = Array.from({ length: DESIGN_LIMITS.swatches + 1 }, () => 'Swatch("#fff")').join(', ')
    expect(problems(`root = Palette([${swatches}])`).some((message) => message.includes('at most'))).toBe(true)
    const links = Array.from({ length: DESIGN_LIMITS.links + 1 }, (_, i) => `"l${i}"`).join(', ')
    expect(problems(`root = Nav("B", [${links}])`).some((message) => message.includes('at most'))).toBe(true)
  })

  it('refuse a window inside a window', () => {
    expect(problems('root = Browser([Browser([Hero("T")])])').some((message) => message.includes('another Browser'))).toBe(true)
  })

  it('report nothing for a block with no design piece', () => {
    expect(checkDesign(parseUi('root = Markdown("hi")', { streaming: false }).root!)).toEqual([])
  })
})
