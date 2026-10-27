import { api } from '@renderer/api/client'
import type { FileKind } from '../chat/passageSources'
import { docOfFile, type Doc } from './searchModel'

type DocumentRow = { corpus_id: string; corpus_name: string; file_id: string; filename: string; chunk_count: number; created_at: number }

type DocumentsResponse = {
  documents?: DocumentRow[]
  total?: number
  collections?: { id: string; name: string; count: number }[]
  kinds?: Record<string, number>
}

export type DocumentsQuery = {
  corpusIds?: readonly string[]
  kind?: FileKind | null
  sort?: 'recent' | 'name'
  limit?: number
  offset?: number
  fileIds?: readonly string[]
}

export type DocumentsPage = {
  docs: Doc[]
  total: number
  // The documents of each collection, under the kind chosen; and of each kind, under the collections chosen.
  collections: { id: string; name: string; count: number }[]
  kinds: Partial<Record<FileKind, number>>
}

/** One page of the indexed documents of the collections the person can read, with the counts to narrow them down by. */
export async function fetchDocuments(query: DocumentsQuery): Promise<DocumentsPage> {
  const params = new URLSearchParams()
  for (const id of query.corpusIds ?? []) params.append('corpus_id', id)
  for (const id of query.fileIds ?? []) params.append('file_id', id)
  if (query.kind) params.set('kind', query.kind)
  params.set('sort', query.sort ?? 'recent')
  params.set('limit', String(query.limit ?? 40))
  params.set('offset', String(query.offset ?? 0))
  const data = await api.get<DocumentsResponse>(`/knowledge/documents?${params.toString()}`)
  return {
    docs: (data.documents ?? []).map((row) => docOfFile({ id: row.corpus_id, name: row.corpus_name }, { fileId: row.file_id, name: row.filename, chunkCount: row.chunk_count, createdAt: row.created_at })),
    total: data.total ?? 0,
    collections: data.collections ?? [],
    kinds: (data.kinds ?? {}) as Partial<Record<FileKind, number>>
  }
}
