import { describe, expect, it } from 'vitest'
import { tryParseExpression } from '../view/charts/expression'
import { parseUi } from './parseUi'
import { checkVars, fillLive, formatNumber, slidersOf, startValues, VAR_LIMITS } from './vars'

const BLOCK = `root = Stack([plot, a, b, eq])
plot = Plot([Curve("a*sin(b*x)", "wave")], -6, 6)
a = Slider("a", 0, 4, 2, 0.5, "Amplitude")
b = Slider("b", 1, 5)
eq = Live("$f(x) = {{a}}\\sin({{b}}x)$, double {{2*a}}")`

const problems = (source: string) => parseUi(source, { streaming: false }).errors.map((error) => error.message)

describe('the variables of a formula', () => {
  it('are read by name, in lower case, as numbers', () => {
    const parsed = tryParseExpression('a*x + B', { A: 2, b: 1 })
    expect(parsed.formula?.(3)).toBe(7)
  })

  it('stay unknown when no slider names them, so that the formula says so', () => {
    expect(tryParseExpression('a*x').error).toContain('Unknown name "a"')
  })

  it('cannot hide a function or a constant: sin stays sin', () => {
    expect(tryParseExpression('sin(x) + e', { sin: 100 }).formula?.(0)).toBeCloseTo(Math.E)
  })
})

describe('the sliders of a block', () => {
  it('are read with their range, their start and their step', () => {
    const result = parseUi(BLOCK, { streaming: false })
    expect(result.errors).toEqual([])
    const sliders = slidersOf(result.root!)
    expect(sliders.map((slider) => slider.name)).toEqual(['a', 'b'])
    expect(sliders[0]).toMatchObject({ min: 0, max: 4, value: 2, step: 0.5 })
    expect(sliders[1].value).toBe(1)
    expect(sliders[1].step).toBeGreaterThan(0)
  })

  it('start from what the reader set, kept inside the range and ignoring what is no number', () => {
    const sliders = slidersOf(parseUi(BLOCK, { streaming: false }).root!)
    expect(startValues(sliders, { a: 99, b: 'x' })).toEqual({ a: 4, b: 1 })
    expect(startValues(sliders, null)).toEqual({ a: 2, b: 1 })
  })
})

describe('the text of a Live', () => {
  it('shows the value of each formula with the current sliders', () => {
    expect(fillLive('{{a}} and {{2*a+b}}', { a: 1.5, b: 2 })).toBe('1.5 and 5')
  })

  it('gives a dash for what has no value and reads a result only once', () => {
    expect(fillLive('{{nobody}} {{1/0}}', {})).toBe('— —')
  })

  it('writes figures short', () => {
    expect(formatNumber(3.14159265)).toBe('3.142')
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(2)).toBe('2')
    expect(formatNumber(1234567)).toBe('1.24e+6')
  })
})

describe('what a block of sliders may not do', () => {
  it('is told when a name is bad, taken by the formulas, or used twice', () => {
    const messages = problems(`root = Stack([Slider("my var", 0, 1), Slider("e", 0, 1), Slider("sin", 0, 1), Slider("k", 0, 1), Slider("k", 0, 2)])`)
    expect(messages.some((message) => message.includes('"my var"'))).toBe(true)
    expect(messages.filter((message) => message.includes('already used by formulas')).length).toBe(2)
    expect(messages.some((message) => message.includes('used twice'))).toBe(true)
  })

  it('is told when a range is empty or there are too many sliders', () => {
    expect(problems('root = Slider("a", 3, 3)').some((message) => message.includes('not above min'))).toBe(true)
    const many = Array.from({ length: VAR_LIMITS.variables + 1 }, (_, i) => `Slider("v${i}", 0, 1)`).join(', ')
    expect(problems(`root = Stack([${many}])`).some((message) => message.includes('at most'))).toBe(true)
  })

  it('is told when a Live uses a name no slider gives', () => {
    expect(problems('root = Stack([Slider("a", 0, 1), Live("{{a*zz}}")])').some((message) => message.includes('{{a*zz}}'))).toBe(true)
  })

  it('reports nothing for a block without sliders', () => {
    expect(checkVars(parseUi('root = Markdown("hi")', { streaming: false }).root!)).toEqual([])
  })
})

describe('the marks that follow the sliders', () => {
  it('accept a formula where a number was expected, and report one that cannot be read', () => {
    const ok = `root = Stack([Slider("a", 1, 3), Slider("b", -4, 4), Plot([Curve("a*x^2 + b*x"), Dot("-b/(2*a)", "-b^2/(4*a)", "vertex"), VLine("-b/(2*a)"), HLine("-b^2/(4*a)")], -5, 5)])`
    expect(problems(ok)).toEqual([])
    expect(problems(`root = Stack([Slider("a", 1, 3), Dot("a*zz", 0)])`).some((message) => message.includes('Dot x "a*zz"'))).toBe(true)
  })
})

describe('switches and choices', () => {
  const block = `root = Stack([Toggle("show", "Cosine", true), Select("fn", ["sin", "cos", "tan"], 1), Plot([Curve("sin(x)", "s", "blue", false, "value", "eq(fn, 0)"), Curve("cos(x)", "c", "green", false, "value", "show")], -5, 5)])`

  it('are variables too: 1 or 0 for a switch, the number of the choice for a list', () => {
    const result = parseUi(block, { streaming: false })
    expect(result.errors).toEqual([])
    const specs = slidersOf(result.root!)
    expect(specs.map((spec) => [spec.name, spec.min, spec.max, spec.value])).toEqual([['show', 0, 1, 1], ['fn', 0, 2, 1]])
  })

  it('are refused with a bad name, one list of a single option, or a show that cannot be read', () => {
    expect(problems('root = Stack([Toggle("sin"), Select("k", ["only"])])').length).toBeGreaterThanOrEqual(2)
    expect(problems('root = Stack([Select("k", ["a", "b"]), Plot([Curve("x", "l", "blue", false, "value", "zz")], 0, 1)])').some((message) => message.includes('show "zz"'))).toBe(true)
  })

  it('compare with eq', () => {
    expect(tryParseExpression('eq(k, 2)', { k: 2 }).formula?.(0)).toBe(1)
    expect(tryParseExpression('eq(k, 2)', { k: 1 }).formula?.(0)).toBe(0)
  })
})
