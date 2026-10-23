import { describe, expect, it } from 'vitest'
import { citedPages, linkedHrefs, type MarkdownNode } from './markdownLinks'

const link = (href: string, text = 'text'): MarkdownNode => ({ tagName: 'a', properties: { href }, children: [{ tagName: 'text' }, { tagName: undefined, properties: { text } }] })
const paragraph = (...children: MarkdownNode[]): MarkdownNode => ({ tagName: 'p', children })

const pages = [
  { url: 'https://github.com/a/b', title: 'A', domain: 'github.com' },
  { url: 'https://github.com/c/d', title: 'C', domain: 'github.com' },
  { url: 'https://pkg.go.dev/x', title: 'X', domain: 'pkg.go.dev' }
]

describe('linkedHrefs', () => {
  it('finds the links of a paragraph, also inside emphasis', () => {
    const node = paragraph(link('https://github.com/a/b'), { tagName: 'strong', children: [link('https://pkg.go.dev/x')] })
    expect(linkedHrefs(node)).toEqual(['https://github.com/a/b', 'https://pkg.go.dev/x'])
  })

  it('leaves the links of a list nested in an item to that list', () => {
    const item: MarkdownNode = { tagName: 'li', children: [link('https://github.com/a/b'), { tagName: 'ul', children: [{ tagName: 'li', children: [link('https://pkg.go.dev/x')] }] }] }
    expect(linkedHrefs(item)).toEqual(['https://github.com/a/b'])
  })

  it('has nothing to find without a node', () => {
    expect(linkedHrefs(undefined)).toEqual([])
  })
})

describe('citedPages', () => {
  it('keeps each consulted page once, and leaves out the others', () => {
    const node = paragraph(link('https://github.com/a/b'), link('https://github.com/c/d'), link('https://pkg.go.dev/x'), link('https://example.org/never-opened'))
    const again = paragraph(link('https://github.com/a/b'), link('https://github.com/a/b/'))
    expect(citedPages(node, pages).map((page) => page.url)).toEqual(['https://github.com/a/b', 'https://github.com/c/d', 'https://pkg.go.dev/x'])
    expect(citedPages(again, pages)).toHaveLength(1)
  })

  it('cites nothing when no link points to a consulted page', () => {
    expect(citedPages(paragraph(link('https://example.org/never-opened')), pages)).toEqual([])
  })
})
