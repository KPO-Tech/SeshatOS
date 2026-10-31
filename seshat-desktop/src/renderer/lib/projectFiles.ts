import { languageForPath } from '@renderer/components/chat/tools/helpers'

/** How a file of a project is shown: what the viewer does with it. */
export type FileKind = 'markdown' | 'notebook' | 'code' | 'table' | 'image' | 'text' | 'document'

const MARKDOWN = new Set(['md', 'markdown', 'mdx'])
const TABLES = new Set(['csv', 'tsv'])
const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'])
// Documents the system's programs open: this view does not draw them yet.
const DOCUMENTS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods'])

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

export function fileKindOf(name: string): FileKind {
  const extension = extensionOf(name)
  if (MARKDOWN.has(extension)) return 'markdown'
  if (extension === 'ipynb') return 'notebook'
  if (TABLES.has(extension)) return 'table'
  if (IMAGES.has(extension)) return 'image'
  if (DOCUMENTS.has(extension)) return 'document'
  if (languageForPath(name)) return 'code'
  return 'text'
}

/** "1.2 GB", "340 KB": the size of a folder or a file, in the unit that fits. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** A folder's path and a name in it, with the separator that folder uses. */
export function joinPath(directory: string, name: string): string {
  const separator = directory.includes('\\') ? '\\' : '/'
  return directory.endsWith('/') || directory.endsWith('\\') ? `${directory}${name}` : `${directory}${separator}${name}`
}

/** Splits a delimited text into rows of cells, with quoted cells (which may hold the delimiter, a quote written twice, or a new line). */
export function parseDelimited(text: string, delimiter: string, maxRows = 500): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      if (rows.length >= maxRows) return { rows, truncated: i < text.length - 1 }
    } else {
      cell += char
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return { rows, truncated: false }
}

/** The path a picture named by a Markdown page points to, from the folder of that page ("./a.png", "../b.png", "dir/c%20d.png"). */
export function resolveRelativePath(pageFile: string, target: string): string {
  const separator = pageFile.includes('\\') ? '\\' : '/'
  const parts = pageFile.split(/[\\/]/)
  parts.pop()
  let clean = target.split(/[?#]/)[0]
  try {
    clean = decodeURIComponent(clean)
  } catch {
    // A name that holds a lone % is kept as it is written.
  }
  for (const part of clean.split(/[\\/]/)) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (parts.length > 1) parts.pop()
    } else parts.push(part)
  }
  return parts.join(separator)
}
