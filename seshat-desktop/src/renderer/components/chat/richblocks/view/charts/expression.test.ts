import { describe, expect, it } from 'vitest'
import { ExpressionError, parseExpression, tryParseExpression } from './expression'

const at = (source: string, x: number) => parseExpression(source)(x)

describe('parseExpression', () => {
  it('reads the usual polynomial', () => {
    expect(at('x^3 - 3*x + 1', 2)).toBe(3)
    expect(at('x**3 - 3*x + 1', -1)).toBe(3)
  })

  it('multiplies when the product is only written', () => {
    expect(at('3x^2', 2)).toBe(12)
    expect(at('2(x+1)', 4)).toBe(10)
    expect(at('x(x-1)', 3)).toBe(6)
    expect(at('(x+1)(x-1)', 3)).toBe(8)
    expect(at('2pi', 1)).toBeCloseTo(2 * Math.PI)
  })

  it('binds a minus looser than a power, and a power to the right', () => {
    expect(at('-x^2', 3)).toBe(-9)
    expect(at('2^3^2', 0)).toBe(512)
    expect(at('2^-1', 0)).toBe(0.5)
    expect(at('(-2)^2', 0)).toBe(4)
  })

  it('knows the usual functions and constants', () => {
    expect(at('sin(pi/2)', 0)).toBeCloseTo(1)
    expect(at('cos(0)', 0)).toBe(1)
    expect(at('ln(e)', 0)).toBeCloseTo(1)
    expect(at('log(1000)', 0)).toBeCloseTo(3)
    expect(at('exp(x)', 0)).toBe(1)
    expect(at('e^x', 1)).toBeCloseTo(Math.E)
    expect(at('sqrt(abs(x))', -16)).toBe(4)
    expect(at('max(x, 2)', 5)).toBe(5)
    expect(at('min(x, 2)', 5)).toBe(2)
  })

  it('does not take the e of an exponent for the constant', () => {
    expect(at('1e-3', 0)).toBeCloseTo(0.001)
    expect(at('2e', 0)).toBeCloseTo(2 * Math.E)
  })

  it('reads the symbols a model likes to write', () => {
    expect(at('x²', 3)).toBe(9)
    expect(at('x³ − 3x', 2)).toBe(2)
    expect(at('2×x', 4)).toBe(8)
    expect(at('√(x)', 9)).toBe(3)
    expect(at('π', 0)).toBeCloseTo(Math.PI)
    expect(at('X + 1', 2)).toBe(3)
  })

  it('gives a number or NaN, never a failure, where the formula is undefined', () => {
    expect(at('1/x', 0)).toBe(Infinity)
    expect(Number.isNaN(at('sqrt(x)', -1))).toBe(true)
    expect(Number.isNaN(at('ln(x)', -1))).toBe(true)
  })

  it('refuses what it cannot read, and says what', () => {
    const message = (source: string) => {
      try {
        parseExpression(source)
        return ''
      } catch (error) {
        expect(error).toBeInstanceOf(ExpressionError)
        return (error as Error).message
      }
    }
    expect(message('')).toContain('empty')
    expect(message('x +')).toContain('too early')
    expect(message('(x + 1')).toContain('parenthesis')
    expect(message('foo(x)')).toContain('Unknown name "foo"')
    expect(message('x $ 2')).toContain('Unexpected')
    expect(message('sin')).toContain('parentheses')
    expect(message('max(1)')).toContain('takes 2')
    expect(message('x )')).toContain('Unexpected')
    expect(message('2 y')).toContain('Unknown name "y"')
  })

  it('cannot run code', () => {
    expect(tryParseExpression('constructor.constructor("return 1")()').error).toBeDefined()
    expect(tryParseExpression('process.exit(1)').error).toBeDefined()
    expect(tryParseExpression('alert(1)').error).toBeDefined()
  })
})

describe('tryParseExpression', () => {
  it('returns the formula, or the message', () => {
    expect(tryParseExpression('x+1').formula?.(1)).toBe(2)
    expect(tryParseExpression('x+').error).toBeTruthy()
  })
})
