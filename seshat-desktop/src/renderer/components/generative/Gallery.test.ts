import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { GALLERIES } from '@renderer/components/chat/richblocks/catalog/galleries'
import { Gallery } from './Gallery'

async function draw(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(Gallery)))
}

describe('the galleries as a grid of collections', () => {
  it('shows one cover for each collection, with its name, its line and its number of examples', async () => {
    const html = await draw('en')
    expect((html.match(/role="button"/g) ?? []).length).toBe(GALLERIES.length)
    for (const name of ['Landing pages', 'Mobile apps', 'Dashboards', 'Brand boards', 'Maths lab', 'Calculators', 'Data science', 'Cloud architectures', 'Learn and practise', 'Decisions and reports']) expect(html).toContain(name)
    expect(html).toContain('Examples: 5')
  })

  it('keeps the pictures out of reach: they cannot be pressed or tabbed to from the grid', async () => {
    const html = await draw('en')
    expect(html).toContain('inert')
    expect(html).toContain('aria-hidden="true"')
  })

  it('does not put a button inside a button', async () => {
    const html = await draw('en')
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s)
  })

  it('says it in French', async () => {
    const html = await draw('fr')
    expect(html).toContain('Pages d&#x27;accueil')
    expect(html).toContain('Exemples : 5')
    expect(html).not.toContain('collections.')
  })
})
