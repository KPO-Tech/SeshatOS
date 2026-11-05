import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { languageOptions } from './multimodal/spokenLanguages'
import { ConfinementCard } from './environment/ConfinementCard'
import { StorageConfig } from './storage/StorageConfig'

async function french() {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions('fr'))
  return instance
}

describe('the pages of Config in French', () => {
  it('draws a card whose texts come from a function that takes t', async () => {
    const instance = await french()
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(ConfinementCard, { mode: 'local', directConfined: false })))
    expect(html).toContain('Confinement des commandes')
    expect(html).toContain('Non confiné')
    expect(html).toContain('tous vos droits d&#x27;utilisateur')
    expect(html).not.toContain('Not confined')
    expect(html).not.toContain('config:')
  })

  it('draws a page that reads its settings, while they load', async () => {
    const instance = await french()
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(StorageConfig)))
    expect(html).toContain('Stockage')
    expect(html).not.toContain('Save</')
  })

  it('names the spoken languages in the language of the interface', async () => {
    const instance = await french()
    await instance.changeLanguage('fr')
    const names = languageOptions(instance.t, 'fr').map((option) => option.label)
    expect(names).toContain('Détecter la langue')
    expect(names).toContain('Anglais')
    expect(names).toContain('Espagnol')
  })
})
