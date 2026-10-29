import { describe, expect, it } from 'vitest'
import { parseUi } from './parseUi'
import type { UiNode } from './types'

const full = (src: string) => parseUi(src, { streaming: false })
const live = (src: string) => parseUi(src, { streaming: true })
const kids = (node: UiNode | null) => (node ? (node.props.children as UiNode[]) : [])
const names = (node: UiNode | null) => kids(node).map((child) => child.name)

// The shape of a block a model wrote in the app: arguments given by name, a Table with a caption, notes, then a Section of Steps.
const COMPARISON = `root = Stack([title, table, notes, migration], direction="column", gap="md")
title = Heading("Two tools compared", 2)
table = Table([Col("Criterion"), Col("First"), Col("Second")], rows, "A comparison for a local app", true)
rows = [
  ["Install size", "About 300 MB", "Under 1 MB"],
  ["Concurrent writes", "Many writers", "One writer at a time"]
]
notes = Stack([n1, n2], direction="column", gap="sm")
n1 = Callout("info", "Writes", "Both share the same single-writer model.")
n2 = Callout("warning", "Size", "The second one is a single file.")
migration = Section("Migration: steps", [steps], true)
steps = Steps([s1, s2])
s1 = Step("Install", "Add the package.")
s2 = Step("Attach", "Open the old file next to the new one.")`

describe('arguments given by name', () => {
  it('accepts name = value after the positional arguments', () => {
    const result = full('root = Stack([Heading("A", 2)], direction="row", gap="lg")')
    expect(result.errors).toEqual([])
    expect(result.root?.props).toMatchObject({ direction: 'row', gap: 'lg' })
    expect(names(result.root)).toEqual(['Heading'])
  })

  it('accepts every argument by name, in any order', () => {
    const result = full('root = Callout(title="Heads up", tone="warning")')
    expect(result.errors).toEqual([])
    expect(result.root?.props).toEqual({ tone: 'warning', title: 'Heads up' })
  })

  it('reports an argument the component does not have and keeps the component', () => {
    const result = full('root = Stack([Separator()], colour="red")')
    expect(names(result.root)).toEqual(['Separator'])
    expect(result.errors[0]).toMatchObject({ code: 'bad-argument' })
    expect(result.errors[0].message).toContain('colour')
  })

  it('reports an argument given twice', () => {
    const result = full('root = Callout("info", "Hi", title="Again")')
    expect(result.errors[0].message).toContain('twice')
  })

  it('still reads plain statements next to calls', () => {
    expect(full('root = Stack([a])\na = Heading("x", 2)').errors).toEqual([])
  })

  it('draws a half-written named argument while streaming', () => {
    const result = live('root = Stack([Separator()], direction=')
    expect(names(result.root)).toEqual(['Separator'])
    expect(result.errors).toEqual([])
  })

  it('draws a whole comparison written with named arguments', () => {
    const result = full(COMPARISON)
    expect(result.errors).toEqual([])
    expect(names(result.root)).toEqual(['Heading', 'Table', 'Stack', 'Section'])
    expect(result.root?.props).toMatchObject({ direction: 'column', gap: 'md' })
  })
})
