import { describe, expect, it } from 'vitest'
import { isRichBlockNode } from './isRichBlockNode'

const pre = (...classes: string[]) => ({
  tagName: 'pre',
  children: [{ tagName: 'code', properties: { className: classes } }]
})

describe('isRichBlockNode', () => {
  it('recognises a seshat-ui fence', () => {
    expect(isRichBlockNode(pre('language-seshat-ui'))).toBe(true)
  })

  it('leaves other code blocks in their pre', () => {
    expect(isRichBlockNode(pre('language-sql'))).toBe(false)
    expect(isRichBlockNode(pre('language-seshat'))).toBe(false)
    expect(isRichBlockNode(pre())).toBe(false)
  })

  it('copes with a node that is not a code block', () => {
    expect(isRichBlockNode(undefined)).toBe(false)
    expect(isRichBlockNode({ tagName: 'pre', children: [{ tagName: 'span' }] })).toBe(false)
  })
})
