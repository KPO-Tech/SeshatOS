// A Jupyter notebook (.ipynb) read for looking at, not for running: its cells, their text, and what they printed or drew.

export type NotebookOutput =
  | { kind: 'text'; text: string; stream?: 'stdout' | 'stderr' }
  | { kind: 'image'; src: string }
  | { kind: 'error'; name: string; message: string; traceback: string }
  | { kind: 'unsupported'; mime: string }

export type NotebookCell = {
  kind: 'markdown' | 'code' | 'raw'
  source: string
  /** The number shown in the margin of a code cell that was run, null when it was not. */
  executionCount: number | null
  outputs: NotebookOutput[]
}

export type Notebook = { language: string; cells: NotebookCell[] }

const MAX_OUTPUT_CHARS = 20_000
// eslint-disable-next-line no-control-regex -- the escape character is what introduces the colour codes of a terminal, which are matched on purpose
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

/** The text of a field that a notebook writes as a string or as a list of lines. */
function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((part) => (typeof part === 'string' ? part : '')).join('')
  return ''
}

function shorten(value: string): string {
  return value.length > MAX_OUTPUT_CHARS ? `${value.slice(0, MAX_OUTPUT_CHARS)}\n... (${value.length - MAX_OUTPUT_CHARS} more characters)` : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const RASTER_IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

function outputOf(raw: unknown): NotebookOutput | null {
  if (!isRecord(raw)) return null
  switch (raw.output_type) {
    case 'stream':
      return { kind: 'text', text: shorten(text(raw.text).replace(ANSI, '')), stream: raw.name === 'stderr' ? 'stderr' : 'stdout' }
    case 'error': {
      const traceback = Array.isArray(raw.traceback) ? raw.traceback.map((line) => (typeof line === 'string' ? line : '')).join('\n') : ''
      return { kind: 'error', name: typeof raw.ename === 'string' ? raw.ename : 'Error', message: typeof raw.evalue === 'string' ? raw.evalue : '', traceback: shorten(traceback.replace(ANSI, '')) }
    }
    case 'execute_result':
    case 'display_data': {
      const data = isRecord(raw.data) ? raw.data : {}
      for (const mime of RASTER_IMAGES) {
        const body = text(data[mime]).replace(/\s+/g, '')
        if (body) return { kind: 'image', src: `data:${mime};base64,${body}` }
      }
      const svg = text(data['image/svg+xml'])
      if (svg) return { kind: 'image', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }
      const plain = text(data['text/plain'])
      if (plain) return { kind: 'text', text: shorten(plain.replace(ANSI, '')) }
      const other = Object.keys(data)[0]
      return other ? { kind: 'unsupported', mime: other } : null
    }
    default:
      return null
  }
}

/** Reads the text of a notebook. Throws when it is not one. */
export function parseNotebook(source: string): Notebook {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error('This file is not a notebook: it is not valid JSON.')
  }
  if (!isRecord(parsed)) throw new Error('This file is not a notebook.')
  // nbformat 4 keeps the cells at the top; version 3 keeps them in worksheets.
  const rawCells = Array.isArray(parsed.cells) ? parsed.cells : Array.isArray(parsed.worksheets) && isRecord(parsed.worksheets[0]) && Array.isArray(parsed.worksheets[0].cells) ? parsed.worksheets[0].cells : null
  if (!rawCells) throw new Error('This file is not a notebook: it has no cells.')

  const metadata = isRecord(parsed.metadata) ? parsed.metadata : {}
  const info = isRecord(metadata.language_info) ? metadata.language_info : {}
  const kernel = isRecord(metadata.kernelspec) ? metadata.kernelspec : {}
  const language = [info.name, kernel.language].find((value): value is string => typeof value === 'string' && value !== '') ?? 'python'

  const cells: NotebookCell[] = []
  for (const raw of rawCells) {
    if (!isRecord(raw)) continue
    const type = raw.cell_type === 'markdown' || raw.cell_type === 'code' ? raw.cell_type : 'raw'
    cells.push({
      kind: type,
      source: text(raw.source ?? raw.input),
      executionCount: typeof raw.execution_count === 'number' ? raw.execution_count : null,
      outputs: type === 'code' && Array.isArray(raw.outputs) ? raw.outputs.map(outputOf).filter((output): output is NotebookOutput => output !== null) : []
    })
  }
  return { language: language.toLowerCase(), cells }
}
