import { describe, expect, it } from 'vitest'
import { highlightLine } from './highlight'
import { PROMPT_EXAMPLES } from '../catalog/examples'

const kinds = (line: string) => highlightLine(line).filter((piece) => piece.kind !== 'space').map((piece) => `${piece.kind}:${piece.text}`)

describe('the colours of a line of seshat-ui', () => {
  it('tells the name of a statement, the component, the strings, numbers and words', () => {
    expect(kinds('plot = Plot([f, "x"], -3, 1.5, null, true)')).toEqual([
      'name:plot', 'punct:=', 'component:Plot', 'punct:(', 'punct:[', 'ref:f', 'punct:,', 'string:"x"', 'punct:]', 'punct:,', 'number:-3', 'punct:,', 'number:1.5', 'punct:,', 'keyword:null', 'punct:,', 'keyword:true', 'punct:)'
    ])
  })

  it('keeps a string with an escaped quote in one piece, and an unfinished one', () => {
    expect(kinds('a = Markdown("say \\"hi\\" now")')[4]).toBe('string:"say \\"hi\\" now"')
    expect(highlightLine('b = Heading("open').at(-1)?.kind).toBe('string')
  })

  it('knows an action', () => {
    expect(kinds('c = Choice("Yes", @Ask("go"))')).toContain('component:@Ask')
  })

  it('gives back every character of every line of the catalogue', () => {
    for (const code of PROMPT_EXAMPLES) {
      for (const line of code.split('\n')) expect(highlightLine(line).map((piece) => piece.text).join('')).toBe(line)
    }
  })
})

describe('the titles of the examples', () => {
  it('are one for each example of the catalogue', async () => {
    const { EXAMPLE_TITLES } = await import('../catalog/examples')
    expect(EXAMPLE_TITLES.length).toBe(PROMPT_EXAMPLES.length)
    for (const title of EXAMPLE_TITLES) expect(title.length).toBeGreaterThan(3)
  })
})
