import { describe, expect, it } from 'vitest'
import { checkDesign, DESIGN_LIMITS, fillCss, readableOn, safeColor, safeFill } from './design'
import { parseUi } from './parseUi'

const problems = (source: string) => parseUi(source, { streaming: false }).errors.map((error) => error.message)

describe('the colours of a design', () => {
  it('are hex codes, written in full and in lower case, and nothing else', () => {
    expect(safeColor('#3B82F6')).toBe('#3b82f6')
    expect(safeColor('#fa0')).toBe('#ffaa00')
    expect(safeColor('red')).toBe('#ef4444')
    expect(safeColor('Orange')).toBe('#f97316')
    expect(safeColor('notacolour')).toBeNull()
    expect(safeColor('rgb(249, 115, 22)')).toBe('#f97316')
    expect(safeColor('rgb(300, 0, 0)')).toBeNull()
    expect(safeColor('hsl(0, 100%, 50%)')).toBe('#ff0000')
    expect(safeColor('hsl(120, 100%, 25%)')).toBe('#008000')
    expect(safeColor('hsl(400, 10%, 10%)')).toBeNull()
    expect(safeColor('rgb(1,2,3); background:url(x)')).toBeNull()
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

describe('the gradients of a design', () => {
  it('are one to three colours joined by >, each read as a colour', () => {
    expect(safeFill('orange')).toEqual({ base: '#f97316', stops: ['#f97316'] })
    expect(safeFill('#f97316 > pink')?.stops).toEqual(['#f97316', '#ec4899'])
    expect(fillCss(safeFill('red > blue > green')!, 90)).toBe('linear-gradient(90deg, #ef4444, #3b82f6, #22c55e)')
    expect(safeFill('red > blue > green > pink')).toBeNull()
    expect(safeFill('red > url(x)')).toBeNull()
    expect(safeFill('')).toBeNull()
  })
})

describe('the pieces of a page', () => {
  it('are read without a complaint when they are well written', () => {
    const block = `root = Browser([Nav("Brand", ["A", "B"], "Go", "#f97316"), Hero("Title", "Sub", "Start", "More", "#3b82f6"), Features([Feature("One", "text", "ai", "#10b981")], 1), Grid([Picture("photo", "#8b5cf6", 1.5)], 2), Footer("2026", ["Terms"])], "https://a.example", "#fff")`
    expect(problems(block)).toEqual([])
  })

  it('are refused with a colour that is none', () => {
    expect(problems('root = Hero("T", null, null, null, "reddish")').some((message) => message.includes('"reddish" is not a colour'))).toBe(true)
    expect(problems('root = Hero("T", null, null, null, "red > nothing")').some((message) => message.includes('is not a colour'))).toBe(true)
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

describe('the new pieces of a page', () => {
  it('are read without a complaint when they are well written', () => {
    const block = `root = Phone([Nav("B"), Cta("Go", "orange", "outline"), Plans([Plan("Free", "0", ["a", "b"], "Start", "slate", true)]), Stats([Stat("10k", "users")]), Testimonial("Great", "Awa Diallo", "Dev", "violet"), Avatar("Awa Diallo"), Logos(["react", "go"], "Used with")], "#0f172a", "serif", "lg")`
    expect(problems(block)).toEqual([])
  })

  it('refuse a font or a radius that is not in the lists, and a phone in a browser', () => {
    expect(problems('root = Browser([Hero("T")], null, null, "comic", "round")').filter((message) => message.startsWith('Expected one of')).length).toBe(2)
    expect(problems('root = Browser([Phone([Hero("T")])])').some((message) => message.includes('cannot hold another'))).toBe(true)
  })

  it('are refused with too many plans, stats, logos or features in a plan', () => {
    const many = (count: number, make: (i: number) => string) => Array.from({ length: count }, (_, i) => make(i)).join(', ')
    expect(problems(`root = Plans([${many(DESIGN_LIMITS.plans + 1, () => 'Plan("p", "1")')}])`).some((message) => message.includes('at most'))).toBe(true)
    expect(problems(`root = Stats([${many(DESIGN_LIMITS.stats + 1, () => 'Stat("1", "x")')}])`).some((message) => message.includes('at most'))).toBe(true)
    expect(problems(`root = Logos([${many(DESIGN_LIMITS.logos + 1, (i) => `"l${i}"`)}])`).some((message) => message.includes('at most'))).toBe(true)
    expect(problems(`root = Plan("p", "1", [${many(DESIGN_LIMITS.planFeatures + 1, (i) => `"f${i}"`)}])`).some((message) => message.includes('at most'))).toBe(true)
  })
})
