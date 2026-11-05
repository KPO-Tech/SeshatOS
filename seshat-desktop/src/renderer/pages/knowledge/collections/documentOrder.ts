import type { CollectionFile } from './collectionsApi'
import type { FileState } from './fileStatus'

/** The kinds of document, in the order they are indexed: what is cheap to read goes first (the same order as the backend's priority). */
export type DocumentFormat = 'text' | 'word' | 'pdf' | 'other'

export const FORMATS: ReadonlyArray<{ id: DocumentFormat; label: string }> = [
  { id: 'text', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.format.text' },
  { id: 'word', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.format.word' },
  { id: 'pdf', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.format.pdf' },
  { id: 'other', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.format.other' }
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
  { id: 'format', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.sort.format' },
  { id: 'name-asc', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.sort.nameAsc' },
  { id: 'name-desc', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.sort.nameDesc' },
  { id: 'state', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.sort.state' }
]

export const STATES: ReadonlyArray<{ id: StateFilter; label: string }> = [
  { id: 'all', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.state.any' },
  { id: 'indexed', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.state.indexed' },
  { id: 'failed', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.state.failed' },
  { id: 'working', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.state.working' },
  { id: 'waiting', label: 'knowledge/collections:pages.knowledge.collections.documentOrder.state.waiting' }
]

export type DocumentView = { sort: SortKey; format: DocumentFormat | 'all'; state: StateFilter }

export const DEFAULT_VIEW: DocumentView = { sort: 'format', format: 'all', state: 'all' }

// A failure first, so it is seen; then what is being done; then what waits; the finished ones last.
const STATE_RANK: Record<FileState['tone'], number> = { failed: 0, working: 1, queued: 2, waiting: 3, ready: 4 }

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
      return file.status !== 'ingested' && (state.tone === 'working' || state.tone === 'queued')
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
