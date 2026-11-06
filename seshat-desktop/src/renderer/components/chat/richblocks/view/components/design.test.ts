import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { RichBlock } from '../RichBlock'

async function draw(code: string) {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions('en'))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(RichBlock, { code, streaming: false, fallback: null })))
}

const SITE = `root = Browser([Nav("Seshat", ["Docs"], "Download", "#f97316"), Hero("Local agents", "On your machine", "Start", "Docs", "#1e3a8a"), Features([Feature("Fast", "Quick", null, "#10b981")], 1), Footer("2026", ["Terms"])], "https://seshat.app", "#ffffff")`

describe('the pieces of a page, drawn', () => {
  it('draws the window with its address, and the sections with their texts', async () => {
    const html = await draw(SITE)
    expect(html).toContain('https://seshat.app')
    for (const word of ['Seshat', 'Download', 'Local agents', 'On your machine', 'Fast', 'Terms']) expect(html).toContain(word)
  })

  it('puts the colours in styles, as hex codes the model chose, and the readable ink on them', async () => {
    const html = await draw(SITE)
    expect(html).toContain('#f97316')
    expect(html).toContain('#1e3a8a')
    // A dark hero takes white text.
    expect(html).toMatch(/background:linear-gradient\(135deg, #1e3a8a[^"]*color:#ffffff/)
  })

  it('draws a palette with the names and the codes, and leaves out a swatch whose colour is not one', async () => {
    const html = await draw('root = Palette([Swatch("#F97316", "Orange"), Swatch("blue", "Not a hex")], "Colours")')
    expect(html).toContain('Orange')
    expect(html).toContain('#f97316')
    expect(html).not.toContain('Not a hex')
  })

  it('never lets a colour that is not a hex code reach a style', async () => {
    const html = await draw('root = Browser([Hero("T", null, null, null, "red; background:url(x)")], null, "expression(1)")')
    expect(html).not.toContain('expression')
    expect(html).not.toContain('url(x)')
  })
})
