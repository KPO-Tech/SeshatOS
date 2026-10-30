import { describe, expect, it } from 'vitest'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { closeDisplayMath, normalizeMathDelimiters, sealOpenFences } from './markdownText'

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

function blocks(text: string): Array<{ type: string; value?: string }> {
  return unified().use(remarkParse).use(remarkMath).parse(text).children.map((node) => ({ type: node.type, value: 'value' in node ? String(node.value) : undefined }))
}

describe('closeDisplayMath', () => {
  const table = String.raw`$$\begin{array}{c|cc}
x & -\infty & 1 \\
f(x) & -\infty & +\infty
\end{array}$$`

  it('keeps a formula closed at the end of a line from swallowing the rest of the message', () => {
    const doc = `## V. Variations\n\n${table}\n\nf is a bijection.\n\n## VI. Asymptotes\n\nDone.`
    // The parser alone reads the formula as open to the end: the heading is the only block before it.
    expect(blocks(doc).map((block) => block.type)).toEqual(['heading', 'math'])
    const fixed = blocks(closeDisplayMath(doc))
    expect(fixed.map((block) => block.type)).toEqual(['heading', 'math', 'paragraph', 'heading', 'paragraph'])
    expect(fixed[1].value).toContain(String.raw`\begin{array}{c|cc}`)
    expect(fixed[1].value).toContain(String.raw`\end{array}`)
  })

  it('leaves a formula that is already in the form the parser reads', () => {
    const doc = 'a\n\n$$\nx = 1\n$$\n\nb'
    expect(closeDisplayMath(doc)).toBe(doc)
  })

  it('leaves a formula written on one line, and a message without any', () => {
    expect(closeDisplayMath('so $$x = 1$$ holds')).toBe('so $$x = 1$$ holds')
    expect(closeDisplayMath('no formula here')).toBe('no formula here')
  })

  it('does not read a $$ written in inline code as a delimiter', () => {
    const doc = 'write `$$` to open a formula, and `$$` again'
    expect(closeDisplayMath(doc)).toBe(doc)
  })

  it('writes a $$ with no partner as text, so it cannot open a block that runs on', () => {
    const doc = 'Intro\n\n$$x = 1\n\nThe rest of the message.'
    expect(blocks(doc).map((block) => block.type)).toContain('math')
    expect(blocks(closeDisplayMath(doc)).map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'paragraph'])
  })

  it('does not pair two $$ that a blank line separates', () => {
    const fixed = closeDisplayMath('first $$ stray\n\nsecond paragraph\n\nthird $$ stray')
    expect(blocks(fixed).map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'paragraph'])
  })
})
