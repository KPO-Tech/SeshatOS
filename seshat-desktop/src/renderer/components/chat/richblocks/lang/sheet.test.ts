import { describe, expect, it } from 'vitest'
import { fillSheetReport, filledRows, markdownTable, SHEET_LIMITS, sheetOf } from './sheet'
import { parseUi } from './parseUi'

const problems = (source: string) => parseUi(source, { streaming: false }).errors.map((error) => error.message)

describe('the table a reader fills in', () => {
  it('is read without a complaint when it is well written', () => {
    expect(problems('root = Sheet(["Item", "Amount"], [["Venue", "1200"], ["Food"]], "Budget", "{{rows}} lines:\\n{{table}}")')).toEqual([])
  })

  it('has every row as long as there are columns, and cells that are text', () => {
    const result = parseUi('root = Sheet(["a", "b", "c"], [["1"], ["x", 2, "z"]])', { streaming: false })
    expect(sheetOf(result.root!)).toEqual({ columns: ['a', 'b', 'c'], rows: [['1', '', ''], ['x', '2', 'z']] })
  })

  it('is refused with no column, too many, too many rows, a row wider than the columns, or a report that names nothing it has', () => {
    expect(problems('root = Sheet([])').some((message) => message.includes('at least one column'))).toBe(true)
    const columns = Array.from({ length: SHEET_LIMITS.columns + 1 }, (_, i) => `"c${i}"`).join(', ')
    expect(problems(`root = Sheet([${columns}])`).some((message) => message.includes('at most'))).toBe(true)
    const rows = Array.from({ length: SHEET_LIMITS.rows + 1 }, () => '["x"]').join(', ')
    expect(problems(`root = Sheet(["a"], [${rows}])`).some((message) => message.includes('at most'))).toBe(true)
    expect(problems('root = Sheet(["a"], [["1", "2"]])').some((message) => message.includes('more cells'))).toBe(true)
    expect(problems('root = Sheet(["a"], null, null, "{{nobody}}")').some((message) => message.includes('{{nobody}}'))).toBe(true)
  })
})

describe('the message of a table', () => {
  it('writes a Markdown table, leaves out the rows that are blank, and escapes what would break it', () => {
    const table = markdownTable(['Item', 'Note'], [['Venue', 'a | b'], ['', ''], ['Food', 'line\nbreak']])
    expect(table).toBe('| Item | Note |\n| --- | --- |\n| Venue | a \\| b |\n| Food | line break |')
    expect(filledRows([['', ' '], ['x', '']])).toEqual([['x', '']])
  })

  it('fills {{table}} and {{rows}} once, and does not read again what it put in', () => {
    const message = fillSheetReport('{{rows}} lines\n{{table}}', ['a'], [['{{rows}}'], ['']])
    expect(message).toBe('1 lines\n| a |\n| --- |\n| {{rows}} |')
  })

  it('is cut at the limit', () => {
    expect(fillSheetReport('{{table}}', ['a'], Array.from({ length: SHEET_LIMITS.rows }, () => ['x'.repeat(SHEET_LIMITS.cell)])).length).toBeLessThanOrEqual(SHEET_LIMITS.message)
  })
})

describe('markdownTable escaping', () => {
  it('keeps a bar inside its cell, also when the cell holds a backslash before it', () => {
    const table = markdownTable(['Path'], [['a|b'], ['a\\|b'], ['C:\\temp']])
    const rows = table.split('\n').slice(2)
    // each row has the two outer bars and nothing else that is not escaped
    for (const row of rows) {
      const unescapedBars = row.replace(/\\\\/g, '').replace(/\\\|/g, '').split('|').length - 1
      expect(unescapedBars).toBe(2)
    }
    expect(rows[1]).toBe('| a\\\\\\|b |')
    expect(rows[2]).toBe('| C:\\\\temp |')
  })
})
