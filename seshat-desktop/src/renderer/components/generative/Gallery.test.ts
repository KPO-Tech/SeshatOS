import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { EXAMPLE_TITLES, PROMPT_EXAMPLES } from '@renderer/components/chat/richblocks/catalog/examples'
import { Gallery } from './Gallery'

async function draw(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(Gallery)))
}

describe('the gallery of examples as a grid of cards', () => {
  it('shows one card for each example, with its title, and a way to open it', async () => {
    const html = await draw('en')
    expect((html.match(/role="button"/g) ?? []).length).toBe(PROMPT_EXAMPLES.length)
    for (const title of EXAMPLE_TITLES) expect(html).toContain(title)
    expect(html).toContain('View')
    expect(html).toContain('Filter by component')
  })

  it('keeps the pictures out of reach: they cannot be pressed or tabbed to from the grid', async () => {
    const html = await draw('en')
    expect(html).toContain('inert')
    expect(html).toContain('aria-hidden="true"')
  })

  it('does not put a button inside a button', async () => {
    const html = await draw('en')
    // Cards are divs with a role; a real <button> never holds another one.
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s)
  })

  it('says it in French', async () => {
    const html = await draw('fr')
    expect(html).toContain('Filtrer par composant')
    expect(html).toContain('Voir')
    expect(html).not.toContain('gallery.')
  })
})
