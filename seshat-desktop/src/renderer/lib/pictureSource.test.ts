import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { describe, expect, it } from 'vitest'
import { pictureChoice } from './pictureSource'

const readme = {
  children: [
    { tagName: 'source', properties: { media: '(prefers-color-scheme: dark)', srcSet: 'docs/brand/lockup-on-dark.svg' } },
    { tagName: 'img', properties: { src: 'docs/brand/lockup-on-light.svg', alt: 'SeshatOS', width: '360' } }
  ]
}

describe('the image of a picture', () => {
  it('takes the source that asks for the dark scheme when the theme is dark', () => {
    expect(pictureChoice(readme, 'dark')).toEqual({ src: 'docs/brand/lockup-on-dark.svg', alt: 'SeshatOS', width: '360', height: undefined })
  })

  it('falls back on the img when the theme is light', () => {
    expect(pictureChoice(readme, 'light')?.src).toBe('docs/brand/lockup-on-light.svg')
  })

  it('takes the source that asks for the light scheme when the theme is light', () => {
    const both = { children: [{ tagName: 'source', properties: { media: '(prefers-color-scheme: light)', srcSet: 'a-light.svg' } }, ...readme.children] }
    expect(pictureChoice(both, 'light')?.src).toBe('a-light.svg')
    expect(pictureChoice(both, 'dark')?.src).toBe('docs/brand/lockup-on-dark.svg')
  })

  it('applies a source with no condition, and ignores one with a condition it does not know', () => {
    const plain = { children: [{ tagName: 'source', properties: { srcSet: 'plain.png 1x, big.png 2x' } }, readme.children[1]] }
    expect(pictureChoice(plain, 'light')?.src).toBe('plain.png')
    const width = { children: [{ tagName: 'source', properties: { media: '(min-width: 600px)', srcSet: 'wide.png' } }, readme.children[1]] }
    expect(pictureChoice(width, 'dark')?.src).toBe('docs/brand/lockup-on-light.svg')
  })

  it('reads a srcset kept as a list', () => {
    const list = { children: [{ tagName: 'source', properties: { srcSet: ['one.png 1x', 'two.png 2x'] } }, readme.children[1]] }
    expect(pictureChoice(list, 'dark')?.src).toBe('one.png')
  })

  it('finds the logo of a README after the HTML has been parsed and sanitized as the document view does', () => {
    const markdown = [
      '<p align="center">',
      '  <picture>',
      '    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockup-on-dark.svg">',
      '    <img src="docs/brand/lockup-on-light.svg" alt="SeshatOS" width="360">',
      '  </picture>',
      '</p>'
    ].join('\n')
    const pictures: Array<Parameters<typeof pictureChoice>[0]> = []
    renderToStaticMarkup(
      createElement(ReactMarkdown, {
        rehypePlugins: [rehypeRaw, [rehypeSanitize, defaultSchema]],
        components: {
          picture({ node }: { node?: unknown }) {
            pictures.push(node as Parameters<typeof pictureChoice>[0])
            return null
          }
        } as never,
        children: markdown
      })
    )
    expect(pictures).toHaveLength(1)
    expect(pictureChoice(pictures[0], 'dark')?.src).toBe('docs/brand/lockup-on-dark.svg')
    expect(pictureChoice(pictures[0], 'light')?.src).toBe('docs/brand/lockup-on-light.svg')
  })

  it('has nothing to show without an img, or without an address', () => {
    expect(pictureChoice({ children: [readme.children[0]] }, 'dark')).toBeNull()
    expect(pictureChoice({ children: [{ tagName: 'img', properties: {} }] }, 'dark')).toBeNull()
    expect(pictureChoice(undefined, 'dark')).toBeNull()
  })
})
