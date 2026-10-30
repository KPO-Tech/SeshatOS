import { describe, expect, it } from 'vitest'
import { autoRange, derivativeOf, drawableRuns, integralSamples, sampleFormula, simpson } from './curve'
import { parseExpression } from './expression'
import { formatTick, linear, niceDomain, niceTicks } from './scale'

describe('niceTicks', () => {
  it('uses steps of 1, 2 or 5 times a power of ten', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10])
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(niceTicks(-3, 3, 6)).toEqual([-3, -2, -1, 0, 1, 2, 3])
    expect(niceTicks(0, 1000, 4)).toEqual([0, 200, 400, 600, 800, 1000])
  })

  it('has no floating point noise', () => {
    expect(niceTicks(0, 0.3, 3)).toEqual([0, 0.1, 0.2, 0.3])
  })

  it('copes with a flat range and with nothing', () => {
    expect(niceTicks(5, 5).length).toBeGreaterThan(1)
    expect(niceTicks(0, 0).includes(0)).toBe(true)
    expect(niceTicks(NaN, 1)).toEqual([])
  })
})

describe('niceDomain', () => {
  it('starts and ends on a tick', () => {
    expect(niceDomain(0.3, 9.4, 5)).toEqual([0, 10])
    expect(niceDomain(-2.7, 2.7, 6)).toEqual([-3, 3])
  })
})

describe('formatTick', () => {
  it('writes short numbers', () => {
    expect(formatTick(0)).toBe('0')
    expect(formatTick(0.1 + 0.2)).toBe('0.3')
    expect(formatTick(-2.5)).toBe('-2.5')
    expect(formatTick(1500)).toBe('1500')
    expect(formatTick(2500000)).toBe('2.5e6')
    expect(formatTick(0.00002)).toBe('2e-5')
    expect(formatTick(Infinity)).toBe('')
  })
})

describe('linear', () => {
  it('maps a domain onto a range, upside down when asked', () => {
    const y = linear([0, 10], [100, 0])
    expect(y(0)).toBe(100)
    expect(y(10)).toBe(0)
    expect(y(2.5)).toBe(75)
  })
})

describe('sampleFormula and derivativeOf', () => {
  const cubic = parseExpression('x^3 - 3*x + 1')

  it('includes both ends', () => {
    const samples = sampleFormula(cubic, -2, 2, 5)
    expect(samples.map((s) => s.x)).toEqual([-2, -1, 0, 1, 2])
    expect(samples.map((s) => s.y)).toEqual([-1, 3, 1, -1, 3])
  })

  it('differentiates a cubic', () => {
    const slope = derivativeOf(cubic)
    for (const x of [-2, -0.5, 0, 1, 3]) expect(slope(x)).toBeCloseTo(3 * x * x - 3, 4)
  })

  it('differentiates sin', () => {
    expect(derivativeOf(parseExpression('sin(x)'))(1)).toBeCloseTo(Math.cos(1), 6)
  })
})

describe('integralSamples and simpson', () => {
  it('is zero at the start and follows the antiderivative', () => {
    const samples = integralSamples(parseExpression('3*x^2'), 0, 2, 401)
    expect(samples[0].y).toBe(0)
    expect(samples[samples.length - 1].y).toBeCloseTo(8, 3)
  })

  it('integrates between two bounds', () => {
    expect(simpson(parseExpression('x^2'), 0, 3)).toBeCloseTo(9, 8)
    expect(simpson(parseExpression('sin(x)'), 0, Math.PI)).toBeCloseTo(2, 8)
    expect(simpson(parseExpression('x^3 - 3*x + 1'), -2, 2)).toBeCloseTo(4, 8)
  })

  it('goes on after a gap, and says NaN in it', () => {
    const samples = integralSamples(parseExpression('1/x'), 0, 2, 5)
    expect(Number.isNaN(samples[0].y)).toBe(true)
    expect(Number.isFinite(samples[4].y)).toBe(true)
  })
})

describe('autoRange', () => {
  it('shows the whole of a well behaved curve, a little padded', () => {
    const [low, high] = autoRange([sampleFormula(parseExpression('x^2'), -2, 2, 200)])
    expect(low).toBeLessThan(0)
    expect(high).toBeGreaterThan(4)
    expect(high).toBeLessThan(5)
  })

  it('keeps to the bulk when a curve runs off to infinity', () => {
    const [low, high] = autoRange([sampleFormula(parseExpression('tan(x)'), -3, 3, 600)])
    expect(high - low).toBeLessThan(60)
  })

  it('has a range even with nothing to show', () => {
    expect(autoRange([[{ x: 0, y: NaN }]])).toEqual([-1, 1])
    expect(autoRange([[{ x: 0, y: 2 }, { x: 1, y: 2 }]])[1]).toBeGreaterThan(2)
  })
})

describe('drawableRuns', () => {
  it('cuts the curve at a hole', () => {
    const samples = sampleFormula(parseExpression('sqrt(x)'), -2, 2, 41)
    const runs = drawableRuns(samples, [0, 2])
    expect(runs).toHaveLength(1)
    expect(runs[0][0].x).toBeGreaterThanOrEqual(0)
  })

  it('does not join the two sides of an asymptote', () => {
    const range = autoRange([sampleFormula(parseExpression('1/x'), -3, 3, 600)])
    const runs = drawableRuns(sampleFormula(parseExpression('1/x'), -3, 3, 600), range)
    expect(runs.length).toBeGreaterThanOrEqual(2)
    for (const run of runs) expect(run.every((s) => s.x < 0) || run.every((s) => s.x > 0)).toBe(true)
  })

  it('keeps a smooth curve in one piece', () => {
    expect(drawableRuns(sampleFormula(parseExpression('x^3'), -2, 2, 200), [-9, 9])).toHaveLength(1)
  })
})
