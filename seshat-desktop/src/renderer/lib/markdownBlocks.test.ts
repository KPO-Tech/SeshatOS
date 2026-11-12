import { describe, expect, it } from 'vitest'
import { splitMarkdownBlocks } from './markdownBlocks'

const lines = (...parts: string[]) => parts.join('\n')
const FENCE = '`'.repeat(3)

describe('splitMarkdownBlocks', () => {
  it('splits paragraphs, headings and tables on blank lines', () => {
    const text = lines('# Title', '', 'First paragraph.', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', 'Last')
    expect(splitMarkdownBlocks(text)).toEqual(['# Title', 'First paragraph.', lines('| a | b |', '|---|---|', '| 1 | 2 |'), 'Last'])
  })

  it('keeps a code fence whole, blank lines included', () => {
    const code = lines(FENCE + 'ts', 'const a = 1', '', 'const b = 2', FENCE)
    expect(splitMarkdownBlocks(lines('Intro', '', code, '', 'After'))).toEqual(['Intro', code, 'After'])
  })

  it('keeps an open fence (still streaming) in the last block', () => {
    const text = lines('Intro', '', FENCE + 'py', 'x = 1', '', 'y = 2')
    expect(splitMarkdownBlocks(text)).toEqual(['Intro', lines(FENCE + 'py', 'x = 1', '', 'y = 2')])
  })

  it('keeps a $$ math block whole', () => {
    const math = lines('$$', 'a = b', '', 'c = d', '$$')
    expect(splitMarkdownBlocks(lines('Text', '', math))).toEqual(['Text', math])
  })

  it('keeps the items of a loose list together', () => {
    const list = lines('- one', '', '- two', '', '1. three')
    expect(splitMarkdownBlocks(lines('Intro', '', list, '', 'End'))).toEqual(['Intro', list, 'End'])
  })

  it('keeps an indented continuation with its item', () => {
    const list = lines('- item', '', '    more of the item')
    expect(splitMarkdownBlocks(list)).toEqual([list])
  })

  it('gives the text back whole when joined', () => {
    const text = lines('# A', '', 'b', '', '- c', '- d', '', FENCE, 'e', FENCE, '', 'f')
    expect(splitMarkdownBlocks(text).join('\n\n')).toBe(text)
  })

  it('gives no block for empty text', () => {
    expect(splitMarkdownBlocks('')).toEqual([])
  })
})
