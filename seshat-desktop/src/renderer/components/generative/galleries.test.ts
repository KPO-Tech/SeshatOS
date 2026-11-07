import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { parseUi } from '@renderer/components/chat/richblocks/lang/parseUi'
import { RichBlock } from '@renderer/components/chat/richblocks/view/RichBlock'
import { GALLERIES } from '@renderer/components/chat/richblocks/catalog/galleries'

async function draw(code: string) {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions('en'))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(RichBlock, { code, streaming: false, fallback: createElement('i', null, 'FALLBACK') })))
}

const ALL = GALLERIES.flatMap((gallery) => gallery.examples.map((example) => ({ gallery: gallery.id, ...example })))

describe('the galleries', () => {
  it('are eleven themed collections and the examples of the agent, each with a name, a line and a tone', () => {
    expect(GALLERIES.map((gallery) => gallery.id)).toEqual(['landing', 'mobile', 'dashboards', 'brand', 'math', 'calculators', 'data', 'cloud', 'schemas', 'learning', 'work', 'core'])
    for (const gallery of GALLERIES) {
      expect(gallery.title.length).toBeGreaterThan(3)
      expect(gallery.description.length).toBeGreaterThan(20)
      expect(gallery.examples.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('have an example with a title that is unique in its gallery', () => {
    for (const gallery of GALLERIES) {
      const titles = gallery.examples.map((example) => example.title)
      expect(new Set(titles).size, gallery.id).toBe(titles.length)
      for (const example of gallery.examples) expect(example.title.length).toBeGreaterThan(2)
    }
  })

  it.each(ALL.map((example) => [`${example.gallery}: ${example.title}`, example.code] as const))('%s is written without a mistake', (_name, code) => {
    const result = parseUi(code, { streaming: false })
    expect(result.errors.map((error) => error.message)).toEqual([])
    expect(result.root).not.toBeNull()
  })

  it.each(ALL.map((example) => [`${example.gallery}: ${example.title}`, example.code] as const))('%s is drawn with no complaint inside', async (_name, code) => {
    const html = await draw(code)
    expect(html).not.toContain('FALLBACK')
    expect(html).not.toContain('Unknown name')
    expect(html).not.toContain('cannot be read')
    expect(html).not.toContain('needs xmin')
    expect(html.length).toBeGreaterThan(150)
  })
})
