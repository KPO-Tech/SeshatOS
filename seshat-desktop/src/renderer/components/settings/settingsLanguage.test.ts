import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { DataControlsSettings } from './DataControlsSettings'
import { ShortcutsSettings } from './ShortcutsSettings'

async function draw(language: 'en' | 'fr', page: () => ReturnType<typeof createElement>) {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, page()))
}

describe('a page of Settings in each language', () => {
  it('draws the shortcuts in French, from the keys of its table', async () => {
    const html = await draw('fr', () => createElement(ShortcutsSettings))
    expect(html).toContain('Raccourcis')
    expect(html).toContain('Basculer la barre latérale')
    expect(html).toContain('Envoyer')
    expect(html).not.toContain('Toggle sidebar')
    expect(html).not.toContain('settings:')
  })

  it('draws the same page in English', async () => {
    const html = await draw('en', () => createElement(ShortcutsSettings))
    expect(html).toContain('Shortcuts')
    expect(html).toContain('Toggle sidebar')
    expect(html).not.toContain('Afficher')
  })

  it('keeps the keys of a shortcut as they are on the keyboard', async () => {
    const html = await draw('fr', () => createElement(ShortcutsSettings))
    expect(html).toContain('Ctrl B')
    expect(html).toContain('Shift Enter')
  })

  it('draws a page with a count in French', async () => {
    const html = await draw('fr', () => createElement(DataControlsSettings))
    expect(html).toContain('Autorisations mémorisées')
    expect(html).toContain('Aucune mémorisée.')
    expect(html).toContain('Prochainement')
  })
})
