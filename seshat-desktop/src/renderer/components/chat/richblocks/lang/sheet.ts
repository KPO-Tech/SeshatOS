import { allNodes } from './vars'
import type { UiError, UiNode } from './types'

// The pure part of the table a reader fills in (ADR 0020): its columns, its rows, the message that is made from them. A cell is text; the
// table lives in the block, and only the message the reader chooses to send leaves it, through the same door as a form.

export const SHEET_LIMITS = {
  columns: 8,
  rows: 30,
  /** Characters of a cell, and of a column name. */
  cell: 120,
  /** Characters of the template of a report, and of the message made from it. */
  report: 1000,
  message: 6000
} as const

const FIELD = /\{\{\s*(table|rows)\s*\}\}/g

export type SheetSpec = { columns: string[]; rows: string[][] }

/** The columns and the rows of a Sheet: every row is as long as there are columns, and no cell is longer than the limit. */
export function sheetOf(sheet: Pick<UiNode, 'props'>): SheetSpec {
  const columns = (Array.isArray(sheet.props.columns) ? sheet.props.columns : []).slice(0, SHEET_LIMITS.columns).map((column) => String(column).slice(0, SHEET_LIMITS.cell))
  const rows = (Array.isArray(sheet.props.rows) ? sheet.props.rows : []).slice(0, SHEET_LIMITS.rows).map((row) => {
    const cells = Array.isArray(row) ? row : []
    return columns.map((_, at) => String(cells[at] ?? '').slice(0, SHEET_LIMITS.cell))
  })
  return { columns, rows }
}

const cell = (value: string) => value.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()

/** The rows that hold something: a row left blank is not sent. */
export const filledRows = (rows: string[][]) => rows.filter((row) => row.some((value) => value.trim() !== ''))

/** The table as a Markdown table, the way a person would paste it. */
export function markdownTable(columns: string[], rows: string[][]): string {
  const head = `| ${columns.map(cell).join(' | ')} |`
  const rule = `| ${columns.map(() => '---').join(' | ')} |`
  const body = filledRows(rows).map((row) => `| ${row.map(cell).join(' | ')} |`)
  return [head, rule, ...body].join('\n')
}

/** The message of a report: the template with {{table}} and {{rows}} filled, in one pass, and cut at the limit. */
export function fillSheetReport(template: string, columns: string[], rows: string[][]): string {
  const values: Record<string, string> = { table: markdownTable(columns, rows), rows: String(filledRows(rows).length) }
  const message = template.replace(FIELD, (_whole, name: string) => values[name] ?? '')
  return message.length > SHEET_LIMITS.message ? message.slice(0, SHEET_LIMITS.message) : message
}

export function checkSheet(root: UiNode): UiError[] {
  const errors: UiError[] = []
  const problem = (message: string, hint?: string) => errors.push({ code: 'bad-argument', message, hint })
  for (const node of allNodes(root).filter((item) => item.name === 'Sheet')) {
    const columns = Array.isArray(node.props.columns) ? node.props.columns : []
    const rows = Array.isArray(node.props.rows) ? node.props.rows : []
    if (columns.length === 0) problem('A Sheet needs at least one column.')
    if (columns.length > SHEET_LIMITS.columns) problem(`A Sheet holds at most ${SHEET_LIMITS.columns} columns.`)
    if (rows.length > SHEET_LIMITS.rows) problem(`A Sheet holds at most ${SHEET_LIMITS.rows} rows.`)
    rows.forEach((row, index) => {
      if (Array.isArray(row) && row.length > columns.length) problem(`Row ${index + 1} of a Sheet has more cells than the ${columns.length} columns.`)
      if (Array.isArray(row) && row.some((value) => String(value).length > SHEET_LIMITS.cell)) problem(`A cell of a Sheet is longer than ${SHEET_LIMITS.cell} characters.`)
    })
    const report = node.props.report
    if (typeof report === 'string') {
      if (report.length > SHEET_LIMITS.report) problem(`The report of a Sheet is longer than ${SHEET_LIMITS.report} characters.`)
      for (const match of report.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)) {
        if (!['table', 'rows'].includes(match[1])) problem(`The report of a Sheet uses {{${match[1]}}}, which does not exist.`, 'Use {{table}} and {{rows}}.')
      }
    }
  }
  return errors
}
