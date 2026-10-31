import { describe, expect, it } from 'vitest'
import { parseNotebook } from './notebook'

const notebook = (cells: unknown[], metadata: unknown = {}) => JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata, cells })

describe('parseNotebook', () => {
  it('reads the cells of a notebook, a source written as a list of lines or as one string', () => {
    const parsed = parseNotebook(
      notebook([
        { cell_type: 'markdown', source: ['# Exploration\n', 'Prices by district.'] },
        { cell_type: 'code', execution_count: 3, source: 'import pandas as pd\ndf = pd.read_csv("x.csv")', outputs: [] },
        { cell_type: 'raw', source: 'raw text' }
      ])
    )
    expect(parsed.cells.map((cell) => cell.kind)).toEqual(['markdown', 'code', 'raw'])
    expect(parsed.cells[0].source).toBe('# Exploration\nPrices by district.')
    expect(parsed.cells[1]).toMatchObject({ executionCount: 3, source: 'import pandas as pd\ndf = pd.read_csv("x.csv")' })
    expect(parsed.cells[2].executionCount).toBeNull()
  })

  it('takes the language of the kernel, python when it says nothing', () => {
    expect(parseNotebook(notebook([], { language_info: { name: 'Julia' } })).language).toBe('julia')
    expect(parseNotebook(notebook([], { kernelspec: { language: 'R' } })).language).toBe('r')
    expect(parseNotebook(notebook([])).language).toBe('python')
  })

  it('reads what a cell printed, with the colour codes of the terminal removed', () => {
    const [cell] = parseNotebook(
      notebook([{ cell_type: 'code', source: 'print(1)', outputs: [{ output_type: 'stream', name: 'stdout', text: ['\u001b[32mok\u001b[0m\n', 'done'] }, { output_type: 'stream', name: 'stderr', text: 'warn' }] }])
    ).cells
    expect(cell.outputs).toEqual([
      { kind: 'text', text: 'ok\ndone', stream: 'stdout' },
      { kind: 'text', text: 'warn', stream: 'stderr' }
    ])
  })

  it('reads a result as a picture when it has one, else as its text, else says what it is', () => {
    const outputs = parseNotebook(
      notebook([
        {
          cell_type: 'code',
          source: 'plot()',
          outputs: [
            { output_type: 'display_data', data: { 'image/png': 'iVBOR\nw0KGgo=\n', 'text/plain': ['<Figure>'] } },
            { output_type: 'execute_result', execution_count: 2, data: { 'text/plain': ['   a  b\n', '0  1  2'] } },
            { output_type: 'execute_result', data: { 'text/html': '<table></table>' } },
            { output_type: 'display_data', data: { 'image/svg+xml': '<svg xmlns="http://www.w3.org/2000/svg"></svg>' } }
          ]
        }
      ])
    ).cells[0].outputs
    expect(outputs[0]).toEqual({ kind: 'image', src: 'data:image/png;base64,iVBORw0KGgo=' })
    expect(outputs[1]).toEqual({ kind: 'text', text: '   a  b\n0  1  2' })
    expect(outputs[2]).toEqual({ kind: 'unsupported', mime: 'text/html' })
    expect(outputs[3]).toMatchObject({ kind: 'image' })
    expect((outputs[3] as { src: string }).src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
  })

  it('reads an error and its traceback', () => {
    const [cell] = parseNotebook(
      notebook([{ cell_type: 'code', source: '1/0', outputs: [{ output_type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero', traceback: ['\u001b[31mTraceback\u001b[0m', 'line 1'] }] }])
    ).cells
    expect(cell.outputs[0]).toEqual({ kind: 'error', name: 'ZeroDivisionError', message: 'division by zero', traceback: 'Traceback\nline 1' })
  })

  it('shortens a very long output', () => {
    const [cell] = parseNotebook(notebook([{ cell_type: 'code', source: 'x', outputs: [{ output_type: 'stream', name: 'stdout', text: 'a'.repeat(50_000) }] }])).cells
    const output = cell.outputs[0] as { text: string }
    expect(output.text.length).toBeLessThan(21_000)
    expect(output.text).toContain('more characters')
  })

  it('reads the older format, which keeps its cells in a worksheet', () => {
    const old = JSON.stringify({ nbformat: 3, worksheets: [{ cells: [{ cell_type: 'code', input: ['1+1'], outputs: [], prompt_number: 1 }] }] })
    expect(parseNotebook(old).cells[0].source).toBe('1+1')
  })

  it('refuses what is not a notebook', () => {
    expect(() => parseNotebook('not json')).toThrow('not valid JSON')
    expect(() => parseNotebook('[]')).toThrow('not a notebook')
    expect(() => parseNotebook('{"a": 1}')).toThrow('no cells')
  })
})
