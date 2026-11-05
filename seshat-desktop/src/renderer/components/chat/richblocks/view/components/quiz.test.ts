import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { RichBlock } from '../RichBlock'

const CODE = `root = Stack([Quiz([Question("Capital of France?", ["Paris", "Rome"], 0, "Paris.")], "Geography", "{{score}}"), Flashcards([Flash("chat", "cat")], "Words")])`

async function draw(language: 'en' | 'fr') {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(RichBlock, { code: CODE, streaming: false, fallback: null })))
}

describe('the quiz and the flashcards of an answer, drawn', () => {
  it('draws the question with its choices, still unanswered, and the first card with its front', async () => {
    const html = await draw('en')
    expect(html).toContain('Capital of France?')
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('Paris')
    expect(html).not.toContain('Paris.')
    expect(html).toContain('Card 1 of 1')
    expect(html).toContain('chat')
    expect(html).not.toContain('>cat<')
    expect(html).toContain('Show the answer')
  })

  it('says it in French', async () => {
    const html = await draw('fr')
    expect(html).toContain('Carte 1 sur 1')
    expect(html).toContain('Voir la réponse')
    expect(html).not.toContain('chat.richblocks')
  })
})
