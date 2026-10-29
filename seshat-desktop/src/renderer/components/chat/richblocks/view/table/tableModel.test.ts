import { describe, expect, it } from 'vitest'
import { parseUi } from '../../lang/parseUi'
import { buildTableModel } from './tableModel'

function model(source: string) {
  const result = parseUi(source, { streaming: false })
  expect(result.errors).toEqual([])
  const table = result.root
  if (!table) throw new Error('no table')
  return buildTableModel(table.props.columns, table.props.rows)
}

const labels = (cells: Array<{ label: string }>) => cells.map((cell) => cell.label)

describe('a plain table', () => {
  const plain = model('root = Table([Col("A"), Col("B", "number")], [["x", 1], ["y", 2]])')

  it('has one heading row and aligns numbers to the right', () => {
    expect(plain.headerRows).toHaveLength(1)
    expect(labels(plain.headerRows[0])).toEqual(['A', 'B'])
    expect(plain.leaves.map((leaf) => leaf.align)).toEqual(['left', 'right'])
  })

  it('can be sorted', () => {
    expect(plain.complex).toBe(false)
    expect(plain.rows.map((row) => row.cells.map((cell) => cell.content))).toEqual([['x', 1], ['y', 2]])
  })
})

describe('grouped columns', () => {
  const grouped = model('root = Table([Col("Tool"), ColGroup("Install", [Col("Size"), Col("Setup")]), ColGroup("Writes", [Col("Mode")], "violet")], [["a", 1, "b", "c"]])')

  it('draws two heading rows, the first with the groups spanning their columns', () => {
    expect(grouped.headerRows).toHaveLength(2)
    expect(grouped.headerRows[0].map((cell) => [cell.label, cell.colSpan, cell.rowSpan])).toEqual([['Tool', 1, 2], ['Install', 2, 1], ['Writes', 1, 1]])
    expect(labels(grouped.headerRows[1])).toEqual(['Size', 'Setup', 'Mode'])
  })

  it('gives the columns of a group the tone of the group, and cannot be sorted', () => {
    expect(grouped.leaves.map((leaf) => leaf.tone)).toEqual([undefined, undefined, undefined, 'violet'])
    expect(grouped.complex).toBe(true)
  })
})

describe('rows and cells', () => {
  it('turns a section row into one cell across the table', () => {
    const t = model('root = Table([Col("A"), Col("B"), Col("C")], [Row(["Embedded"], "blue", "section"), ["x", "y", "z"]])')
    expect(t.rows[0]).toMatchObject({ kind: 'section', tone: 'blue' })
    expect(t.rows[0].cells).toHaveLength(1)
    expect(t.rows[0].cells[0]).toMatchObject({ colSpan: 3, bold: true })
    expect(t.complex).toBe(true)
  })

  it('reads the tone, weight and alignment of a Cell', () => {
    const t = model('root = Table([Col("A"), Col("B")], [[Cell("ok", "success", true, 1, 1, "center"), "plain"]])')
    expect(t.rows[0].cells[0]).toMatchObject({ content: 'ok', tone: 'success', bold: true, align: 'center' })
    expect(t.rows[0].cells[1]).toMatchObject({ content: 'plain', bold: false })
  })

  it('merges cells to the right with colspan', () => {
    const t = model('root = Table([Col("A"), Col("B"), Col("C")], [[Cell("wide", null, false, 2), "end"]])')
    expect(t.rows[0].cells.map((cell) => [cell.colSpan, cell.column?.label])).toEqual([[2, 'A'], [1, 'C']])
  })

  it('cuts a cell that runs past the last column', () => {
    const t = model('root = Table([Col("A"), Col("B")], [[Cell("too wide", null, false, 5)]])')
    expect(t.rows[0].cells[0].colSpan).toBe(2)
  })

  it('lets a cell with rowspan take its column in the rows below', () => {
    const t = model('root = Table([Col("A"), Col("B"), Col("C")], [[Cell("tall", null, false, 1, 2), "b1", "c1"], ["b2", "c2"]])')
    expect(t.rows[1].cells.map((cell) => cell.column?.label)).toEqual(['B', 'C'])
    expect(t.rows[0].cells[0].rowSpan).toBe(2)
  })

  it('marks a total row and keeps its place', () => {
    const t = model('root = Table([Col("A"), Col("B", "number")], [["x", 1], Row(["Total", 1], null, "total")])')
    expect(t.rows.map((row) => row.kind)).toEqual(['normal', 'total'])
  })

  it('draws a plain Row like a list of cells, without making the table complex', () => {
    const t = model('root = Table([Col("A")], [Row(["x"])])')
    expect(t.complex).toBe(false)
  })
})
