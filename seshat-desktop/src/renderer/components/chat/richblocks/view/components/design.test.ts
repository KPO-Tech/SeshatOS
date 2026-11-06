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
    const html = await draw('root = Palette([Swatch("#F97316", "Orange"), Swatch("notacolour", "Not a hex")], "Colours")')
    expect(html).toContain('Orange')
    expect(html).toContain('#f97316')
    expect(html).not.toContain('Not a hex')
  })

  it('never lets a colour that is not a hex code reach a style', async () => {
    const html = await draw('root = Browser([Hero("T", null, null, null, "red; background:url(x)")], null, "expression(1)", "evil; x", "1px")')
    expect(html).not.toContain('expression')
    expect(html).not.toContain('url(x)')
  })

  it('draws a gradient from its colours, and a name or rgb() as the code it stands for', async () => {
    const html = await draw('root = Browser([Hero("T", null, null, null, "orange > rgb(236, 72, 153)")])')
    expect(html).toContain('linear-gradient(135deg, #f97316, #ec4899)')
  })

  it('draws the pieces of a landing page: logos, stats, prices, a quote, a button', async () => {
    const html = await draw('root = Browser([Logos(["react", "Acme"], "Works with"), Stats([Stat("10k+", "users")]), Plans([Plan("Team", "12 EUR", ["Shared"], "Try", "orange", true)]), Testimonial("Great tool", "Awa Diallo", "Dev"), Cta("Join", "blue")], "https://a.example", "#fff", "serif", "lg")')
    for (const word of ['Works with', 'Acme', '10k+', 'users', 'Team', '12 EUR', 'Shared', 'Great tool', 'Awa Diallo', 'AD', 'Join']) expect(html).toContain(word)
    expect(html).toContain('Georgia')
    expect(html).toContain('1.25rem')
  })

  it('draws a phone around its screen', async () => {
    const html = await draw('root = Phone([Hero("Hello phone")], "#0f172a")')
    expect(html).toContain('Hello phone')
    expect(html).toContain('#0f172a')
  })

  it('draws a dashboard: the side bar, the figures with their change, the rows, and a curve', async () => {
    const html = await draw('root = Browser([Shell([SideItem("Overview"), SideItem("Team")], [Kpi("Users", "24", "+12%"), Kpi("Bugs", "7", "-3%"), Tile([Spark([1, 3, 2, 5], "orange"), DataRows(["Name", "State"], [["Website", "Late"]])], "Activity")], "Seshat", "#f97316")])')
    for (const word of ['Seshat', 'Overview', 'Team', 'Users', '24', '+12%', 'Activity', 'Website', 'Late']) expect(html).toContain(word)
    expect(html).toContain('#16a34a')
    expect(html).toContain('#dc2626')
    expect(html).toContain('<path')
  })

  it('draws the logo of a technology found by its plain name, and the name alone for the others', async () => {
    const html = await draw('root = Browser([Logos(["react", "Stripe", "Acme"])])')
    // A logo is a drawing; Acme has none.
    expect((html.match(/<svg/g) ?? []).length).toBe(2)
    for (const word of ['react', 'Stripe', 'Acme']) expect(html).toContain(word)
  })
})
