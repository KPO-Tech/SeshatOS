import type { CollectionFile } from './collectionsApi'
import type { FileState } from './fileStatus'

/** The kinds of document, in the order they are indexed: what is cheap to read goes first (the same order as the backend's priority). */
export type DocumentFormat = 'text' | 'word' | 'pdf' | 'other'

export const FORMATS: ReadonlyArray<{ id: DocumentFormat; label: string }> = [
  { id: 'text', label: 'Text' },
  { id: 'word', label: 'Word' },
  { id: 'pdf', label: 'PDF' },
  { id: 'other', label: 'Other' }
]

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'html', 'htm'])

export function formatOf(name: string): DocumentFormat {
  const dot = name.lastIndexOf('.')
  const extension = dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
  if (TEXT_EXTENSIONS.has(extension)) return 'text'
  if (extension === 'docx') return 'word'
  if (extension === 'pdf') return 'pdf'
  return 'other'
}

export type SortKey = 'format' | 'name-asc' | 'name-desc' | 'state'
export type StateFilter = 'all' | 'indexed' | 'failed' | 'working' | 'waiting'

export const SORTS: ReadonlyArray<{ id: SortKey; label: string }> = [
  { id: 'format', label: 'Format' },
  { id: 'name-asc', label: 'Name A to Z' },
  { id: 'name-desc', label: 'Name Z to A' },
  { id: 'state', label: 'State' }
]

export const STATES: ReadonlyArray<{ id: StateFilter; label: string }> = [
  { id: 'all', label: 'Any state' },
  { id: 'indexed', label: 'Indexed' },
  { id: 'failed', label: 'Failed' },
  { id: 'working', label: 'In progress' },
  { id: 'waiting', label: 'Not indexed' }
]

export type DocumentView = { sort: SortKey; format: DocumentFormat | 'all'; state: StateFilter }

export const DEFAULT_VIEW: DocumentView = { sort: 'format', format: 'all', state: 'all' }

// A failure first, so it is seen; then what is being done; then what waits; the finished ones last.
const STATE_RANK: Record<FileState['tone'], number> = { failed: 0, working: 1, waiting: 2, ready: 3 }

const compareNames = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

function matchesState(file: CollectionFile, state: FileState, filter: StateFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'indexed':
      return file.status === 'ingested'
    case 'failed':
      return state.tone === 'failed'
    case 'working':
      return file.status !== 'ingested' && state.tone === 'working'
    case 'waiting':
      return file.status !== 'ingested' && state.tone === 'waiting'
  }
}

/** The documents of a collection as the reader asked to see them: filtered, then sorted, without changing the list it is given. */
export function arrange(files: CollectionFile[], stateOf: (file: CollectionFile) => FileState, view: DocumentView): CollectionFile[] {
  const shown = files.filter((file) => (view.format === 'all' || formatOf(file.name) === view.format) && matchesState(file, stateOf(file), view.state))
  const formatRank = (file: CollectionFile) => FORMATS.findIndex((format) => format.id === formatOf(file.name))
  return shown.sort((a, b) => {
    switch (view.sort) {
      case 'name-asc':
        return compareNames(a.name, b.name)
      case 'name-desc':
        return compareNames(b.name, a.name)
      case 'state':
        return STATE_RANK[stateOf(a).tone] - STATE_RANK[stateOf(b).tone] || compareNames(a.name, b.name)
      case 'format':
        return formatRank(a) - formatRank(b) || compareNames(a.name, b.name)
    }
  })
}

/** The documents that "Retry all failed" starts again. */
export function failedFiles(files: CollectionFile[], stateOf: (file: CollectionFile) => FileState): CollectionFile[] {
  return files.filter((file) => stateOf(file).tone === 'failed')
}
