import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { RichBlock } from '../RichBlock'

const BLOCK = `root = Stack([plot, a, eq])
plot = Plot([Curve("a*x", "line")], -2, 2)
a = Slider("a", 0, 4, 3, 1, "Slope")
eq = Live("slope {{a}}, twice {{2*a}}")`

async function draw(code: string) {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions('en'))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(RichBlock, { code, streaming: false, fallback: null })))
}

describe('the sliders of an answer, drawn', () => {
  it('draws a range input at its start value, and the text that shows the numbers', async () => {
    const html = await draw(BLOCK)
    expect(html).toContain('type="range"')
    expect(html).toContain('aria-label="Slope"')
    expect(html).toContain('slope 3, twice 6')
  })

  it('draws the curve with the value of the slider, with no complaint about an unknown name', async () => {
    const html = await draw(BLOCK)
    expect(html).not.toContain('Unknown name')
  })

  it('moves a mark with the slider: the vertex of a parabola sits at -b/(2a)', async () => {
    const html = await draw('root = Stack([Slider("a", 1, 3, 2), Slider("b", -4, 4, 4), Plot([Curve("a*x^2 + b*x"), Dot("-b/(2*a)", "-b^2/(4*a)", "vertex")], -5, 5)])')
    expect(html).toContain('vertex')
    expect(html).not.toContain('cannot be read')
  })
})

describe('switches and choices, drawn', () => {
  const code = `root = Stack([Toggle("c", "Cosine", false), Select("fn", ["Sine", "Cosine"], 1, "Function"), Plot([Curve("sin(x)", "sine", "blue", false, "value", "eq(fn, 0)"), Curve("cos(x)", "cosine", "green", false, "value", "c")], -5, 5)])`

  it('draws a switch and a list, and leaves out the curve that is not shown', async () => {
    const html = await draw(code)
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('<option value="1" selected="">Cosine</option>')
    expect(html).not.toContain('>sine<')
    expect(html).not.toContain('>cosine<')
  })
})
