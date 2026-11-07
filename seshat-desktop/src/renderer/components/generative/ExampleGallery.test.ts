import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { PROMPT_EXAMPLES } from '@renderer/components/chat/richblocks/catalog/examples'
import { ExampleGallery, familiesOf } from './ExampleGallery'

async function draw(language: 'en' | 'fr', props: Parameters<typeof ExampleGallery>[0] = {}) {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions(language))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(ExampleGallery, props)))
}

describe('the families of an example', () => {
  it('are those of the components it calls, and basics when it calls only the common ones', () => {
    expect(familiesOf('root = Table([Col("a")], [["1"]])')).toEqual(['basics'])
    expect(familiesOf('root = Plot([Curve("x")], -1, 1)')).toEqual(['charts'])
    expect(familiesOf('root = Form([TextArea("a")], Submit("Send", "{{a}}"))')).toEqual(['forms'])
    expect(familiesOf('root = Browser([Hero("T")])')).toEqual(['design'])
    expect(familiesOf('root = Stack([Quiz([Question("q", ["a", "b"], 0)]), Browser([Hero("T")])])').sort()).toEqual(['design', 'forms'])
  })

  it('give every example of the catalogue at least one family', () => {
    for (const code of PROMPT_EXAMPLES) expect(familiesOf(code).length).toBeGreaterThan(0)
  })
})

describe('the gallery of examples, drawn', () => {
  it('draws the examples with their sources, and the line of what the chat would receive', async () => {
    const html = await draw('en')
    expect(html).toContain('What the chat would receive (0)')
    expect(html).toContain('Nothing yet')
    expect(html).toContain('seshat-ui')
    expect((html.match(/role="tablist"/g) ?? []).length).toBe(PROMPT_EXAMPLES.length)
  })

  it('can start from a family, and says in French what it shows', async () => {
    const html = await draw('fr', { initialFamily: 'design' })
    expect(html).toContain('Formulaires')
    expect(html).toContain('Ce que le chat recevrait (0)')
    expect(html).not.toContain('gallery.families')
    const design = PROMPT_EXAMPLES.filter((code) => familiesOf(code).includes('design')).length
    expect((html.match(/role="tablist"/g) ?? []).length).toBe(design)
  })
})
