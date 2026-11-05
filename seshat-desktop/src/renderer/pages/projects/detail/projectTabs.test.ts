import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { ProjectTabs } from './ProjectTabs'

async function draw(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(ProjectTabs, { tab: 'files', sessionCount: 3, onSelect: () => undefined })))
}

describe('the tabs of a project page', () => {
  it('draw their titles, never the keys of the catalogue', async () => {
    for (const language of ['en', 'fr'] as const) {
      const html = await draw(language)
      expect(html).not.toContain('shell:')
      expect(html).not.toContain('pages.projects')
    }
  })

  it('are in French', async () => {
    const html = await draw('fr')
    expect(html).toContain('Vue d&#x27;ensemble')
    expect(html).toContain('Fichiers')
    expect(html).toContain('Sessions')
  })

  it('are in English', async () => {
    const html = await draw('en')
    expect(html).toContain('Overview')
    expect(html).toContain('Files')
  })
})
