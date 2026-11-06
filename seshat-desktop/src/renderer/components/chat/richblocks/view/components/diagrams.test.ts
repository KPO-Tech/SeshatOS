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
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(RichBlock, { code, streaming: false, fallback: createElement('i', null, 'FALLBACK') })))
}

describe('the diagrams of an answer, drawn', () => {
  it('draws a honeycomb: a hexagon for each part, the colour the model chose and the text that reads on it', async () => {
    const html = await draw('root = Hive([[Hex("Vision", "#172554")], [Hex("Outcomes", "#172554"), Hex("Value", "#f97316")]], "Role", "Strategy", "Model")')
    for (const word of ['Vision', 'Outcomes', 'Value', 'Role', 'Strategy', 'Model']) expect(html).toContain(word)
    expect(html).toContain('clip-path:polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)')
    expect(html).toContain('#172554')
    // Dark hexagons take white text, the orange one takes dark text.
    expect(html).toMatch(/background:#172554;color:#ffffff/)
    expect(html).toMatch(/background:#f97316;color:#111827/)
  })

  it('keeps every hexagon inside the honeycomb', async () => {
    const html = await draw('root = Hive([[Hex("a")], [Hex("b"), Hex("c")], [Hex("d")], [Hex("e"), Hex("f")], [Hex("g")]])')
    const boxes = [...html.matchAll(/left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%;height:([\d.]+)%/g)].map((match) => match.slice(1).map(Number))
    expect(boxes.length).toBe(7)
    for (const [left, top, width, height] of boxes) {
      expect(left).toBeGreaterThanOrEqual(0)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(left + width).toBeLessThanOrEqual(100.01)
      expect(top + height).toBeLessThanOrEqual(100.01)
    }
  })

  it('draws a process, a cycle with its arrows, a pyramid, a funnel, a matrix and a stack', async () => {
    const html = await draw(
      'root = Stack([Chevrons([Chev("Plan", "first"), Chev("Do")]), Cycle([Loop("A"), Loop("B"), Loop("C"), Loop("D")], "Centre"), Pyramid([Level("Top"), Level("Base")]), Pyramid([Level("Wide"), Level("Narrow")], null, true), Quadrant([Quad("q1"), Quad("q2"), Quad("q3"), Quad("q4")], "Effort", "Impact"), Layers([Layer("UI", "React"), Layer("Data", "SQL")])])'
    )
    for (const word of ['Plan', 'first', 'Centre', 'Top', 'Base', 'Wide', 'Narrow', 'q1', 'q4', 'Effort', 'Impact', 'UI', 'React', 'Data', 'SQL']) expect(html).toContain(word)
    // One arrow for each step of the cycle.
    expect((html.match(/marker-end="url\(#cycle-head\)"/g) ?? []).length).toBe(4)
  })

  it('never lets a colour that is not one reach a style', async () => {
    const html = await draw('root = Hive([[Hex("a", "red; background:url(x)")]])')
    expect(html).not.toContain('url(x)')
  })
})

describe('a venn and a tree, drawn', () => {
  it('draws the sets with their words and what they share', async () => {
    const html = await draw('root = Venn([VSet("Business", "Value", "#2563eb"), VSet("Design", "Needs", "#db2777"), VSet("Tech")], "Product")')
    for (const word of ['Business', 'Value', 'Design', 'Needs', 'Tech', 'Product']) expect(html).toContain(word)
    expect((html.match(/<circle/g) ?? []).length).toBe(3)
  })

  it('draws a tree: every node, and the lines that join them to their parent', async () => {
    const html = await draw('root = Tree(Branch("CEO", [Branch("CTO", [Branch("Dev")]), Branch("CFO")], "Amina"), "Org")')
    for (const word of ['CEO', 'Amina', 'CTO', 'Dev', 'CFO', 'Org']) expect(html).toContain(word)
    // A stem and a line over the children of each node that has some.
    expect((html.match(/h-px bg-app-border/g) ?? []).length).toBe(3)
  })
})

describe('a hub, drawn', () => {
  it('draws the core, every satellite and an arrow towards the centre', async () => {
    const html = await draw('root = Hub(Spoke("Rivalry", "Fight", "#1e3a8a"), [Spoke("New entrants"), Spoke("Suppliers"), Spoke("Buyers"), Spoke("Substitutes")], "Porter", "in")')
    for (const word of ['Rivalry', 'New entrants', 'Suppliers', 'Buyers', 'Substitutes', 'Porter']) expect(html).toContain(word)
    expect((html.match(/<line /g) ?? []).length).toBe(4)
  })
})
