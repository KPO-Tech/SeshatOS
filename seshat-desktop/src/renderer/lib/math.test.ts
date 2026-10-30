import { describe, expect, it } from 'vitest'
import { isMathBlockNode, mathKind, renderMath } from './math'

describe('mathKind', () => {
  it('tells an inline formula from a displayed one and from code', () => {
    expect(mathKind(['language-math', 'math-inline'])).toBe('inline')
    expect(mathKind('language-math math-display')).toBe('display')
    expect(mathKind('language-ts')).toBeNull()
    expect(mathKind(undefined)).toBeNull()
  })
})

describe('isMathBlockNode', () => {
  it('is true for a pre that holds a displayed formula only', () => {
    expect(isMathBlockNode({ children: [{ tagName: 'code', properties: { className: ['language-math', 'math-display'] } }] })).toBe(true)
    expect(isMathBlockNode({ children: [{ tagName: 'code', properties: { className: ['language-ts'] } }] })).toBe(false)
  })
})

describe('renderMath', () => {
  it('draws a formula, comma decimals and a column of limits included', () => {
    expect(renderMath(String.raw`\alpha \approx 1{,}5434`, false)).toContain('katex')
    expect(renderMath(String.raw`\mathcal{C}_{g^{-1}}`, false)).toContain('katex')
  })

  it('gives null, not a red page, for a formula it cannot read', () => {
    expect(renderMath(String.raw`x & -\infty & & -1`, false)).toBeNull()
    expect(renderMath(String.raw`\frac{`, false)).toBeNull()
  })

  it('gives the same answer twice', () => {
    expect(renderMath('a^2+b^2', true)).toBe(renderMath('a^2+b^2', true))
  })
})
