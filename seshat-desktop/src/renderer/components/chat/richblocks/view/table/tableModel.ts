import { isNode } from '../../lang/parseUi'
import type { UiNode } from '../../lang/types'

export type Align = 'left' | 'right' | 'center'

export type LeafColumn = { label: string; kind: string; align: Align; tone?: string }

export type HeaderCell = {
  label: string
  colSpan: number
  rowSpan: number
  tone?: string
  align: Align
  /** The index of the column this heading sorts, when it is one column. */
  leaf?: number
}

export type BodyCell = {
  content: unknown
  tone?: string
  bold: boolean
  colSpan: number
  rowSpan: number
  align: Align
  column?: LeafColumn
}

export type RowKind = 'normal' | 'section' | 'total' | 'header'

export type BodyRow = { kind: RowKind; tone?: string; cells: BodyCell[]; source: unknown[] }

export type TableModel = {
  leaves: LeafColumn[]
  headerRows: HeaderCell[][]
  rows: BodyRow[]
  /** True when the table has merged cells or rows that are not plain lists: it cannot be sorted. */
  complex: boolean
}

const asAlign = (value: unknown, fallback: Align): Align => (value === 'left' || value === 'right' || value === 'center' ? value : fallback)
const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const asSpan = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1)

function leafOf(col: UiNode): LeafColumn {
  const kind = asString(col.props.kind) ?? 'text'
  const numeric = kind === 'number' || kind === 'percent' || kind === 'money'
  return { label: String(col.props.label), kind, align: asAlign(col.props.align, numeric ? 'right' : 'left'), tone: asString(col.props.tone) }
}

/** The columns of a table, the heading rows above them (one, or two when columns are grouped), and the leaf columns. */
function buildHeader(columns: unknown): { leaves: LeafColumn[]; headerRows: HeaderCell[][] } {
  const items = Array.isArray(columns) ? columns.filter(isNode) : []
  const grouped = items.some((item) => item.name === 'ColGroup')
  const leaves: LeafColumn[] = []
  const top: HeaderCell[] = []
  const second: HeaderCell[] = []

  for (const item of items) {
    if (item.name === 'ColGroup') {
      const children = Array.isArray(item.props.columns) ? item.props.columns.filter(isNode) : []
      const tone = asString(item.props.tone)
      top.push({ label: String(item.props.label), colSpan: Math.max(1, children.length), rowSpan: 1, tone, align: 'center' })
      for (const child of children) {
        const leaf = leafOf(child)
        leaves.push({ ...leaf, tone: leaf.tone ?? tone })
        second.push({ label: leaf.label, colSpan: 1, rowSpan: 1, tone: leaf.tone ?? tone, align: leaf.align, leaf: leaves.length - 1 })
      }
    } else {
      const leaf = leafOf(item)
      leaves.push(leaf)
      top.push({ label: leaf.label, colSpan: 1, rowSpan: grouped ? 2 : 1, tone: leaf.tone, align: leaf.align, leaf: leaves.length - 1 })
    }
  }
  return { leaves, headerRows: grouped ? [top, second] : [top] }
}

function asCell(value: unknown): { content: unknown; tone?: string; bold: boolean; colSpan: number; rowSpan: number; align?: Align } {
  if (isNode(value) && value.name === 'Cell') {
    return {
      content: value.props.content,
      tone: asString(value.props.tone),
      bold: value.props.bold === true,
      colSpan: asSpan(value.props.colspan),
      rowSpan: asSpan(value.props.rowspan),
      align: value.props.align === undefined ? undefined : asAlign(value.props.align, 'left')
    }
  }
  return { content: value, bold: false, colSpan: 1, rowSpan: 1 }
}

/**
 * Places the cells of the rows on the columns the way an HTML table does: a cell with a rowspan takes its column in the rows
 * below, so those rows leave it out. A cell that would run past the last column is cut at it.
 */
function placeRows(rowsProp: unknown, leaves: LeafColumn[]): { rows: BodyRow[]; complex: boolean } {
  const columnCount = Math.max(1, leaves.length)
  const rows: BodyRow[] = []
  const taken: number[] = Array.from({ length: columnCount }, () => 0)
  let complex = false

  for (const entry of Array.isArray(rowsProp) ? rowsProp : []) {
    const isRow = isNode(entry) && entry.name === 'Row'
    const source = isRow ? (Array.isArray(entry.props.cells) ? (entry.props.cells as unknown[]) : []) : Array.isArray(entry) ? (entry as unknown[]) : []
    const kind = isRow && (entry.props.kind === 'section' || entry.props.kind === 'total' || entry.props.kind === 'header') ? (entry.props.kind as RowKind) : 'normal'
    const tone = isRow ? asString(entry.props.tone) : undefined
    if (isRow && (kind !== 'normal' || tone !== undefined)) complex = true

    const cells: BodyCell[] = []
    if (kind === 'section') {
      const first = asCell(source[0])
      cells.push({ ...first, bold: true, colSpan: columnCount, rowSpan: 1, align: first.align ?? 'left' })
    } else {
      let column = 0
      for (const item of source) {
        while (column < columnCount && taken[column] > 0) column++
        if (column >= columnCount) break
        const cell = asCell(item)
        const colSpan = Math.min(cell.colSpan, columnCount - column)
        if (colSpan > 1 || cell.rowSpan > 1) complex = true
        cells.push({ ...cell, colSpan, align: cell.align ?? leaves[column]?.align ?? 'left', column: leaves[column] })
        for (let c = column; c < column + colSpan; c++) taken[c] = Math.max(taken[c], cell.rowSpan)
        column += colSpan
      }
    }
    for (let c = 0; c < columnCount; c++) if (taken[c] > 0) taken[c]--
    rows.push({ kind, tone, cells, source })
  }
  return { rows, complex }
}

export function buildTableModel(columns: unknown, rows: unknown): TableModel {
  const { leaves, headerRows } = buildHeader(columns)
  const placed = placeRows(rows, leaves)
  return { leaves, headerRows, rows: placed.rows, complex: placed.complex || headerRows.length > 1 }
}
