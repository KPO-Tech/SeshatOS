import { describe, expect, it } from 'vitest'
import { normalizeMathDelimiters, sealOpenFences } from './markdownText'

describe('sealOpenFences', () => {
  it('closes a fence left open by a streaming message', () => {
    expect(sealOpenFences('text\n```ts\nconst a = 1')).toBe('text\n```ts\nconst a = 1\n```')
  })

  it('leaves a balanced document alone', () => {
    const doc = 'a\n```\ncode\n```\nb'
    expect(sealOpenFences(doc)).toBe(doc)
  })
})

describe('normalizeMathDelimiters', () => {
  it('turns the LaTeX bracket forms into the dollar forms the parser reads', () => {
    expect(normalizeMathDelimiters('so \\(x+1\\) holds')).toBe('so $x+1$ holds')
    expect(normalizeMathDelimiters('\\[a=b\\]')).toBe('$$\na=b\n$$')
  })

  it('does not touch code fences', () => {
    const doc = '```\n\\(not math\\)\n```'
    expect(normalizeMathDelimiters(doc)).toBe(doc)
  })
})
