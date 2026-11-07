import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { RichBlock } from '../RichBlock'
import { RichActionProvider } from '../actions/richActions'

async function draw(language: 'en' | 'fr', code: string) {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  const block = createElement(RichBlock, { code, streaming: false, fallback: null })
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(RichActionProvider, { ask: () => undefined, busy: false, children: block })))
}

const SHEET = 'root = Sheet(["Item", "Amount"], [["Venue", "1200"], ["Food", ""]], "Budget", "Rows: {{rows}}\\n{{table}}")'

describe('the table a reader fills in, drawn', () => {
  it('draws the columns, the starting rows in cells that can be edited, and a way to add a row', async () => {
    const html = await draw('en', SHEET)
    for (const word of ['Item', 'Amount', 'Budget']) expect(html).toContain(word)
    expect((html.match(/<input/g) ?? []).length).toBe(4)
    expect(html).toContain('value="Venue"')
    expect(html).toContain('Add a row')
    expect(html).toContain('Remove row 1')
  })

  it('offers to send the table when the rows hold something, and says it in French', async () => {
    const html = await draw('fr', SHEET)
    expect(html).toContain('Envoyer mon tableau')
    expect(html).toContain('Ajouter une ligne')
    expect(html).not.toContain('chat.richblocks')
  })

  it('has no button to send when no report was given, nor when the rows are all blank', async () => {
    expect(await draw('en', 'root = Sheet(["a"], [["x"]])')).not.toContain('Send my table')
    expect(await draw('en', 'root = Sheet(["a"], [[""]], null, "{{table}}")')).not.toContain('Send my table')
  })

  it('has no button to open a mail application out of the desktop app', async () => {
    const html = await draw('en', 'root = Draft("Hello", "Subject", "a@b.co")')
    expect(html).toContain('Copy')
    expect(html).not.toContain('Open in mail')
  })
})
