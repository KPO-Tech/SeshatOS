import { describe, expect, it } from 'vitest'
import { hasMarkdown } from './MarkdownText'

describe('hasMarkdown', () => {
  it('sees the Markdown a plain paragraph would show as symbols', () => {
    expect(hasMarkdown('**bold** word')).toBe(true)
    expect(hasMarkdown('use `CAST` here')).toBe(true)
    expect(hasMarkdown('see [the doc](https://example.com)')).toBe(true)
    expect(hasMarkdown('- one\n- two')).toBe(true)
    expect(hasMarkdown('1. first')).toBe(true)
    expect(hasMarkdown('line one\nline two')).toBe(true)
  })

  it('leaves a plain cell alone', () => {
    expect(hasMarkdown('SQLite')).toBe(false)
    expect(hasMarkdown('12 Mo')).toBe(false)
    expect(hasMarkdown('2 * 3')).toBe(false)
  })
})
