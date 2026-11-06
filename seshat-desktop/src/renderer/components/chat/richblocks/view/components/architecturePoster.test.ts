import i18next from 'i18next'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { parseUi } from '../../lang/parseUi'
import { RichBlock } from '../RichBlock'

async function draw(code: string) {
  const instance = i18next.createInstance()
  await instance.use(catalogLoader).init(i18nOptions('en'))
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(RichBlock, { code, streaming: false, fallback: createElement('i', null, 'FALLBACK') })))
}

const POSTER = `root = Architecture([a, b], [f], "Platform", "row", true)
a = Panel([db], "Sources", "teal", null, false, "column")
db = Item("Orders", null, "PostgreSQL", true, "teal", "cylinder")
b = Panel([box], "Warehouse", "violet", null, false, "column")
box = Item("Facts", "database", null, true)
f = Flow("a", "b", null, false, "block")`

describe('the poster look of an architecture', () => {
  it('is read without a complaint, and refuses a direction, a shape or a style it does not know', () => {
    expect(parseUi(POSTER, { streaming: false }).errors).toEqual([])
    const bad = (code: string) => parseUi(code, { streaming: false }).errors.map((error) => error.message).filter((message) => message.startsWith('Expected one of'))
    expect(bad('root = Architecture([], [], "t", "diagonal")')).toHaveLength(1)
    expect(bad('root = Item("x", null, null, true, null, "sphere")')).toHaveLength(1)
    expect(bad('root = Architecture([], [Flow("a", "b", null, false, "wavy")])')).toHaveLength(1)
  })

  it('draws a database as a cylinder with its label and its caption, in the colour of its tone', async () => {
    const html = await draw(POSTER)
    expect(html).toContain('M1 15 C1 3 99 3 99 15')
    expect(html).toContain('Orders')
    expect(html).toContain('PostgreSQL')
    expect(html).toContain('text-teal-500')
  })

  it('draws the title large inside a frame, and the stages in a row', async () => {
    const html = await draw(POSTER)
    expect(html).toContain('uppercase')
    expect(html).toContain('Platform')
    expect(html).toContain('rounded-3xl')
    expect(html).toContain('flex-row flex-wrap items-stretch gap-16')
  })

  it('keeps the plain look when nothing of the poster is asked', async () => {
    const html = await draw('root = Architecture([a], [], "Plain")\na = Panel([i], "Box", "blue", null, false, "column")\ni = Item("One", "database", null, true)')
    expect(html).not.toContain('rounded-3xl')
    expect(html).not.toContain('M1 15 C1 3 99 3 99 15')
    expect(html).toContain('Plain')
  })
})
