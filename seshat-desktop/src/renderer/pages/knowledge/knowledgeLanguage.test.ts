import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { askStop } from './ask/askReadiness'
import { ComingNext } from './components/ComingNext'
import { formatSize } from './sources/folderPlanFormat'

async function instanceIn(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return instance
}

describe('Knowledge in each language', () => {
  it('draws a Knowledge screen in French, with the catalogues of several folders', async () => {
    const instance = await instanceIn('fr')
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(ComingNext, { tab: 'search' })))
    expect(html).toContain('Retrouver un document par mot-clé')
    expect(html).toContain('Rechercher')
    expect(html).not.toContain('Find a document')
    expect(html).not.toContain('knowledge/')
  })

  it('translates what a function hands back as a key, and counts in the plural of the language', async () => {
    const fr = await instanceIn('fr')
    const stop = askStop({ loading: false, collectionsFailed: false, collectionCount: 0, mode: 'standalone', canManage: true, embedder: null })
    expect(fr.t(stop?.title ?? '')).toBe('Pas encore de documents sur lesquels poser des questions')
    expect(formatSize(12_345, fr.t)).toBe('12.3 Ko')
    expect(fr.t('knowledge/collections:pages.knowledge.collections.counts.document', { count: 1 })).toBe('1 document')
    expect(fr.t('knowledge/collections:pages.knowledge.collections.counts.failedDocument', { count: 2 })).toBe('2 documents en échec')
  })

  it('draws it in English', async () => {
    const en = await instanceIn('en')
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: en }, createElement(ComingNext, { tab: 'search' })))
    expect(html).toContain('Find a document by keyword')
    expect(en.t('knowledge/collections:pages.knowledge.collections.counts.document', { count: 3 })).toBe('3 documents')
  })
})
