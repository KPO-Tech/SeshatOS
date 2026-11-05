import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { HomeStage } from './HomeStage'

async function draw(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(HomeStage, { onPick: () => undefined })))
}

describe('the start page in each language', () => {
  it('speaks French, with the sentence in the right order', async () => {
    const html = await draw('fr')
    expect(html).toContain('Sur quoi')
    expect(html).toContain('travaillons-nous')
    expect(html).toContain('Gérer des fichiers')
    expect(html).toContain('Privé et local')
    expect(html).not.toContain('Work with files')
    expect(html).not.toContain('shell:')
  })

  it('speaks English', async () => {
    const html = await draw('en')
    expect(html).toContain('What are we')
    expect(html).toContain('Work with files')
    expect(html).not.toContain('Sur quoi')
  })
})
