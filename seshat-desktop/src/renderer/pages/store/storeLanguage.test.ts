import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { StorePage } from './index'

async function draw(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(I18nextProvider, { i18n: instance }, createElement(StorePage))))
}

describe('the Store in each language', () => {
  it('draws the Store in French, descriptions of the platforms included', async () => {
    const html = await draw('fr')
    expect(html).toContain('Boutique')
    expect(html).toContain('Bientôt disponible')
    expect(html).toContain('Explorez et transformez des données structurées.')
    expect(html).toContain('Knowledge')
    expect(html).not.toContain('Coming soon')
    expect(html).not.toContain('store:')
  })

  it('draws the Store in English', async () => {
    const html = await draw('en')
    expect(html).toContain('Store')
    expect(html).toContain('Coming soon')
    expect(html).toContain('Explore and transform structured data.')
    expect(html).not.toContain('Boutique')
  })
})
