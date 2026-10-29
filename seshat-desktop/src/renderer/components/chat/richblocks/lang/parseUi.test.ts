import { describe, expect, it } from 'vitest'
import { parseUi } from './parseUi'
import type { UiNode } from './types'

const full = (src: string) => parseUi(src, { streaming: false })
const live = (src: string) => parseUi(src, { streaming: true })
const kids = (node: UiNode | null, prop = 'children') => (node ? (node.props[prop] as UiNode[]) : [])
const children = (node: UiNode | null) => kids(node).map((child) => child.name)

const REPORT = `root = Stack([title, kpis, table, note])
title = Heading("Terminal agents compared", 2)
kpis = MetricRow([m1, m2])
m1 = Metric("Tools compared", 5)
m2 = Metric("With a native sandbox", 3, "+1", "up")
table = Table([Col("Tool"), Col("Sandbox"), Col("Memory")], rows)
rows = [["Claude Code", Badge("yes", "success"), "CLAUDE.md"], ["Aider", Badge("no", "danger"), "chat history"]]
note = Callout("warning", "Not documented", "OpenCode does not document its internal database schema.")`

describe('parseUi', () => {
  it('builds the whole tree from a complete block', () => {
    const result = full(REPORT)
    expect(result.errors).toEqual([])
    expect(children(result.root)).toEqual(['Heading', 'MetricRow', 'Table', 'Callout'])
    const table = kids(result.root)[2]
    expect(table.props.rows).toEqual([
      ['Claude Code', { kind: 'element', name: 'Badge', props: { text: 'yes', tone: 'success' } }, 'CLAUDE.md'],
      ['Aider', { kind: 'element', name: 'Badge', props: { text: 'no', tone: 'danger' } }, 'chat history']
    ])
  })

  it('accepts a name before its definition and renders what has arrived while streaming', () => {
    const early = live('root = Stack([a, b])\na = Heading("First", 2)')
    expect(children(early.root)).toEqual(['Heading'])
    expect(early.errors).toEqual([])
    expect(early.unresolved).toEqual(['b'])

    const done = full('root = Stack([a, b])\na = Heading("First", 2)\nb = Separator()')
    expect(children(done.root)).toEqual(['Heading', 'Separator'])
    expect(done.errors).toEqual([])
  })

  it('shows a half-written string and closes open brackets while streaming', () => {
    const result = live('root = Card([h])\nh = Heading("Monthly Rev')
    const heading = kids(result.root)[0]
    expect(heading.props.text).toBe('Monthly Rev')
    expect(result.errors).toEqual([])

    const nested = live('root = Stack([Heading("A", 2), Callout("info", "T"')
    expect(children(nested.root)).toEqual(['Heading', 'Callout'])
  })

  it('keeps a text cut at the end after the stream, and says so', () => {
    const result = full('root = Card([Heading("Done", 2)')
    expect(children(result.root)).toEqual(['Heading'])
    expect(result.errors.map((error) => error.code)).toEqual(['unclosed'])
  })

  it('does not report a half-typed component name while streaming', () => {
    const result = live('root = Stack([a])\na = Hea')
    expect(result.errors).toEqual([])
    expect(children(result.root)).toEqual([])
  })

  it('drops an unknown component, reports it with the valid names, and keeps the rest', () => {
    const result = full('root = Stack([Banner("x"), Heading("ok", 2)])')
    expect(children(result.root)).toEqual(['Heading'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('unknown-component')
    expect(result.errors[0].hint).toContain('Heading')
  })

  it('drops a component that lacks a required argument and says which', () => {
    const result = full('root = Stack([Callout("info"), Heading("ok", 2)])')
    expect(children(result.root)).toEqual(['Heading'])
    expect(result.errors[0]).toMatchObject({ code: 'missing-argument' })
    expect(result.errors[0].message).toContain('title')
    expect(result.errors[0].hint).toBe('Callout(tone, title, body?)')
  })

  it('ignores a bad optional argument instead of dropping the component', () => {
    const result = full('root = Stack([Badge("new", "purple")])')
    expect(children(result.root)).toEqual(['Badge'])
    expect(result.errors[0].code).toBe('bad-argument')
    expect(kids(result.root)[0].props).toEqual({ text: 'new' })
  })

  it('skips an optional argument with null', () => {
    const result = full('root = Stack([Metric("Users", 120, null, "up")])')
    expect(kids(result.root)[0].props).toEqual({ label: 'Users', value: 120, trend: 'up' })
  })

  it('reads a broken line, then goes on with the next statement', () => {
    const result = full('root = Stack([a, b])\na = Heading("ok" "oops", 2)\nb = Separator()')
    expect(result.errors.map((error) => error.code)).toEqual(['syntax', 'unresolved-reference'])
    expect(children(result.root)).toEqual(['Separator'])
  })

  it('lets a later statement replace an earlier one of the same name', () => {
    const result = full('root = Stack([a])\na = Heading("old", 2)\na = Heading("new", 2)')
    expect(kids(result.root)[0].props.text).toBe('new')
  })

  it('stops a statement that refers to itself', () => {
    const result = full('root = Stack([a])\na = Card([a])')
    expect(result.errors.map((error) => error.code)).toContain('cycle')
  })

  it('reports a missing root only once the stream is over', () => {
    expect(live('a = Heading("x", 2)').errors).toEqual([])
    expect(full('a = Heading("x", 2)').errors.map((error) => error.code)).toEqual(['no-root'])
  })

  it('reads multi-line lists, trailing commas and single quotes', () => {
    const result = full(`root = Steps([
  Step('Install', 'Run the installer', 'done'),
  Step('Configure'),
])`)
    expect(result.errors).toEqual([])
    expect(kids(result.root, 'items').map((step) => step.props.title)).toEqual(['Install', 'Configure'])
  })

  it('turns numeric text into a number and a number into text where the catalog asks', () => {
    const result = full('root = Stack([Heading(42, "2"), Metric("A", "7")])')
    const [heading, metric] = kids(result.root)
    expect(heading.props).toEqual({ text: '42', level: 2 })
    expect(metric.props.value).toBe('7')
  })

  it('reads actions and refuses a link that is not http', () => {
    const object = full('root = Button("Explain", @Ask("Explain the second row", { row: 2 }))')
    expect(object.errors[0].code).toBe('bad-argument')

    const asks = full('root = Button("Explain", @Ask("Explain the second row"))')
    expect(asks.errors).toEqual([])
    expect(asks.root?.props.action).toEqual({ kind: 'action', name: 'Ask', args: ['Explain the second row'] })

    const bad = full('root = Button("Go", @OpenUrl("javascript:alert(1)"))')
    expect(bad.root).toBeNull()
    expect(bad.errors[0].message).toContain('http')
  })

  it('only accepts the components a slot allows', () => {
    const result = full('root = Table([Heading("x", 2)], [["a"]])')
    expect(result.errors[0].code).toBe('wrong-component')
  })
})
