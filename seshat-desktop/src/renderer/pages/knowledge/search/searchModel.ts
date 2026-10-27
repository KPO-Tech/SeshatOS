import { kindOfFile, type FileKind } from '../chat/passageSources'

// One passage a search brought back, with what is needed to open its document.
export type Hit = {
  ref: string
  score: number
  corpusId: string
  collection: string
  fileId: string
  // The name of the document as the collection keeps it, folders included: "Legal/Contracts/a.pdf".
  path: string
  pages: number[]
  section: string
  text: string
}

/** One document, with the passages of it that matched. */
export type Doc = {
  key: string
  corpusId: string
  collection: string
  fileId: string
  path: string
  name: string
  folder: string
  kind: FileKind
  // The best score of its passages.
  score: number
  pages: number[]
  // The passages of it that matched; none when the document is only listed.
  hits: Hit[]
  // When it was added to its collection, in seconds; 0 when not known.
  addedAt: number
  // How many passages it was indexed as.
  chunkCount: number
}

export type SortKey = 'relevance' | 'recent' | 'name'

export type Filters = {
  // Empty: every collection.
  collectionIds: ReadonlySet<string>
  // Null: every kind.
  kind: FileKind | null
}

export const NO_FILTERS: Filters = { collectionIds: new Set(), kind: null }

/** The name of a document without its folders: "Legal/Contracts/a.pdf" is "a.pdf". */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** The folders of a document, "Legal / Contracts" for "Legal/Contracts/a.pdf", or nothing. A first folder that is the name of the collection is not repeated. */
export function folderOf(path: string, collection = ''): string {
  const folders = path.split(/[\\/]/).filter(Boolean).slice(0, -1)
  if (folders.length > 0 && folders[0] === collection) folders.shift()
  return folders.join(' / ')
}

/** The id of the file a passage key points at: "rag/{collection}/{file}#chunk-3". */
export function fileIdOfKey(key: string): string {
  return key.split('/')[2]?.split('#')[0] ?? ''
}

/** One entry per document, in the order of the best passage of each. */
export function groupDocs(hits: readonly Hit[]): Doc[] {
  const docs: Doc[] = []
  const byKey = new Map<string, Doc>()
  for (const hit of hits) {
    const key = `${hit.corpusId}\u0000${hit.fileId}`
    let doc = byKey.get(key)
    if (!doc) {
      doc = {
        key,
        corpusId: hit.corpusId,
        collection: hit.collection,
        fileId: hit.fileId,
        path: hit.path,
        name: baseName(hit.path) || hit.collection,
        folder: folderOf(hit.path, hit.collection),
        kind: kindOfFile(hit.path),
        score: hit.score,
        pages: [],
        hits: [],
        addedAt: 0,
        chunkCount: 0
      }
      byKey.set(key, doc)
      docs.push(doc)
    }
    doc.hits.push(hit)
    doc.score = Math.max(doc.score, hit.score)
    for (const page of hit.pages) if (!doc.pages.includes(page)) doc.pages.push(page)
  }
  for (const doc of docs) doc.pages.sort((a, b) => a - b)
  return docs
}

export const KIND_LABEL: Record<FileKind, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'Slides', md: 'Text', other: 'Other' }
const KIND_ORDER: FileKind[] = ['pdf', 'docx', 'xlsx', 'pptx', 'md', 'other']

export type Facets = {
  collections: { id: string; name: string; count: number }[]
  kinds: { kind: FileKind; count: number }[]
}

/** What the documents offer to narrow them down by, counted over the documents given. */
export function facetsOf(docs: readonly Doc[]): Facets {
  const collections = new Map<string, { id: string; name: string; count: number }>()
  const kinds = new Map<FileKind, number>()
  for (const doc of docs) {
    const entry = collections.get(doc.corpusId) ?? { id: doc.corpusId, name: doc.collection, count: 0 }
    entry.count += 1
    collections.set(doc.corpusId, entry)
    kinds.set(doc.kind, (kinds.get(doc.kind) ?? 0) + 1)
  }
  return {
    collections: [...collections.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    kinds: KIND_ORDER.filter((kind) => kinds.has(kind)).map((kind) => ({ kind, count: kinds.get(kind) ?? 0 }))
  }
}

export function filterDocs(docs: readonly Doc[], filters: Filters): Doc[] {
  return docs.filter((doc) => (filters.collectionIds.size === 0 || filters.collectionIds.has(doc.corpusId)) && (!filters.kind || doc.kind === filters.kind))
}

export function sortDocs(docs: readonly Doc[], key: SortKey): Doc[] {
  if (key === 'recent') return [...docs].sort((a, b) => b.addedAt - a.addedAt || a.name.localeCompare(b.name))
  if (key === 'name') return [...docs].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
  return [...docs].sort((a, b) => b.score - a.score)
}

/** "2 passages", "1 passage". */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** A document of a collection as it is listed, before any search. */
export function docOfFile(collection: { id: string; name: string }, file: { fileId: string; name: string; chunkCount: number; createdAt: number }): Doc {
  return {
    key: `${collection.id}\u0000${file.fileId}`,
    corpusId: collection.id,
    collection: collection.name,
    fileId: file.fileId,
    path: file.name,
    name: baseName(file.name) || collection.name,
    folder: folderOf(file.name, collection.name),
    kind: kindOfFile(file.name),
    score: 0,
    pages: [],
    hits: [],
    addedAt: file.createdAt,
    chunkCount: file.chunkCount
  }
}

/** The documents of a search with what the listing knows of them (when they were added, how many passages they hold). */
export function withListing(docs: readonly Doc[], listing: readonly Doc[]): Doc[] {
  const known = new Map(listing.map((doc) => [doc.key, doc]))
  return docs.map((doc) => {
    const entry = known.get(doc.key)
    return entry ? { ...doc, addedAt: entry.addedAt, chunkCount: entry.chunkCount } : doc
  })
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago", or a date for what is older than a month. */
export function ago(seconds: number, now: number = Date.now()): string {
  if (!seconds) return ''
  const diff = Math.max(0, Math.round(now / 1000 - seconds))
  const unit = (value: number, name: string) => `${value} ${name}${value === 1 ? '' : 's'} ago`
  if (diff < 60) return 'just now'
  if (diff < 3600) return unit(Math.floor(diff / 60), 'minute')
  if (diff < 86400) return unit(Math.floor(diff / 3600), 'hour')
  if (diff < 30 * 86400) return unit(Math.floor(diff / 86400), 'day')
  return new Date(seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
