import { describe, expect, it } from 'vitest'
import { parseUi } from './parseUi'
import type { UiNode } from './types'

const full = (src: string) => parseUi(src, { streaming: false })
const live = (src: string) => parseUi(src, { streaming: true })
const list = (node: UiNode | null, prop: string) => (node ? (node.props[prop] as UiNode[]) : [])

const DRAWING = `root = Architecture([top, store], [f1, f2], "Local app")
top = Panel([ui, api], "Runtime", "orange", "si:go", false, "row")
ui = Item("Desktop UI", "monitor", "React", true)
api = Item("HTTP API", "api", null, true)
store = Panel([db], "Storage", "blue", "database", true)
db = Item("SQLite", "si:sqlite")
f1 = Flow("ui", "api", null, true)
f2 = Flow(api, db, "writes", false, "dashed")`

describe('architecture drawings', () => {
  it('reads an Architecture with its Panels, Items and Flows', () => {
    const result = full(DRAWING)
    expect(result.errors).toEqual([])
    expect(result.root?.name).toBe('Architecture')
    expect(list(result.root, 'children').map((child) => child.name)).toEqual(['Panel', 'Panel'])
    expect(list(result.root, 'flows').map((flow) => flow.name)).toEqual(['Flow', 'Flow'])
  })

  it('gives a box reached through a name that name as its id', () => {
    const result = full(DRAWING)
    const [top, store] = list(result.root, 'children')
    expect(top.id).toBe('top')
    expect(store.id).toBe('store')
    expect(list(top, 'children').map((item) => item.id)).toEqual(['ui', 'api'])
  })

  it('points a Flow at a name written in quotes or bare', () => {
    const [quoted, bare] = list(full(DRAWING).root, 'flows')
    expect(quoted.props).toMatchObject({ from: 'ui', to: 'api', both: true })
    expect(bare.props).toMatchObject({ from: 'api', to: 'db', label: 'writes', style: 'dashed' })
  })

  it('does not follow a bare name given to a Flow, so a cycle through it is harmless', () => {
    const result = full('root = Architecture([a], [Flow(a, a)])\na = Item("x")')
    expect(result.errors).toEqual([])
  })

  it('reports a bare name that is never defined, but not while streaming', () => {
    expect(full('root = Architecture([a], [Flow(a, ghost)])\na = Item("x")').errors.map((error) => error.code)).toEqual(['unresolved-reference'])
    expect(live('root = Architecture([a], [Flow(a, ghost)])\na = Item("x")').errors).toEqual([])
  })

  it('draws a half-written drawing while streaming', () => {
    const result = live('root = Architecture([top], [f1])\ntop = Panel([ui], "Runtime", "orange")\nui = Item("Desktop UI", "mon')
    expect(result.errors).toEqual([])
    expect(list(list(result.root, 'children')[0], 'children')[0].props.label).toBe('Desktop UI')
  })

  it('keeps an icon name as text, whatever it is', () => {
    const result = full('root = Item("x", "no-such-icon")')
    expect(result.errors).toEqual([])
    expect(result.root?.props.icon).toBe('no-such-icon')
  })
})
