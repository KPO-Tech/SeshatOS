import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import type { PullRequest } from '@renderer/lib/pullRequests'
import { ChangesList } from './panels/changes/ChangesList'
import { errorMarkdown, errorPresentation } from './streaming/streamErrors'

async function french() {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions('fr'))
  return instance
}

const pull: PullRequest = {
  owner: 'KPO-Tech', repo: 'SeshatOS', number: 279, title: 'feat(chat): teach the drawing', url: 'https://github.com/KPO-Tech/SeshatOS/pull/279',
  state: 'open', additions: 12, deletions: 3, checks: 'passing', mergeable_state: 'clean', updated_at: '2026-10-31T10:00:00Z'
}

describe('the chat in French', () => {
  it('tells a failed turn in French, with what to do', async () => {
    const { t } = await french()
    expect(errorPresentation('x', 'auth', t).title).toBe('Clé du fournisseur refusée')
    expect(errorPresentation('x', 'auth', t).hint).toContain('Fournisseurs')
    expect(errorPresentation('boom', undefined, t).title).toBe('Erreur du fournisseur')
    const markdown = errorMarkdown('invalid key', 'quota', t)
    expect(markdown).toContain('> Crédit du fournisseur épuisé')
    expect(markdown).toContain('invalid key')
  })

  it('draws the list of changes in French', async () => {
    const instance = await french()
    const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(ChangesList, { pulls: [pull], onRefresh: () => undefined, onMerge: () => undefined })))
    expect(html).toContain('>Fusionner<')
    expect(html).not.toContain('>Merge<')
    expect(html).not.toContain('chat:')
  })

  it('counts with the plural of the language', async () => {
    const instance = await french()
    expect(instance.t('chat:chat.panels.subagentPanel.turns', { count: 1 })).toBe('1 tour')
    expect(instance.t('chat:chat.panels.subagentPanel.turns', { count: 4 })).toBe('4 tours')
    expect(instance.t('chat:chat.tools.renderers.globToolView.matches', { count: 0 })).toBe('0 résultat')
  })
})
