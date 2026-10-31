import { api } from '@renderer/api/client'

export type Collection = {
  id: string
  name: string
  description: string
  chunkCount: number
  fileCount: number | null
  updatedAt: number
  // The source the collection comes from; empty for the default one (made in the app).
  sourceId: string
}

export type FileStatus = 'pending' | 'ingested' | 'failed'

export type CollectionFile = {
  fileId: string
  name: string
  status: FileStatus
  chunkCount: number
  createdAt: number
}

// An indexing job of one file: what tells a failure apart and lets it be tried again.
export type IndexingJob = {
  id: string
  fileId: string
  status: string
  lastError: string
  createdAt: number
  /** When the job may run again (ms since the epoch), 0 when it is not held back. */
  nextRunAt: number
}

type CorpusRow = { id: string; name: string; description?: string; chunk_count?: number; file_count?: number; updated_at?: number; source_id?: string }
type FileRow = { file_id: string; filename: string; status: string; chunk_count?: number; created_at?: number }
type JobRow = { id: string; file_id: string; status: string; last_error?: string; created_at?: number; next_run_at?: string }

function toCollection(row: CorpusRow): Collection {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    chunkCount: row.chunk_count ?? 0,
    fileCount: typeof row.file_count === 'number' ? row.file_count : null,
    updatedAt: row.updated_at ?? 0,
    sourceId: row.source_id ?? ''
  }
}

function toStatus(raw: string): FileStatus {
  return raw === 'ingested' || raw === 'failed' ? raw : 'pending'
}

/** One piece of a document as it was indexed. */
export type Passage = { position: number; text: string }

/** The passages a document of a collection was indexed as, in the order of the document. */
export async function fetchPassages(corpusId: string, fileId: string): Promise<Passage[]> {
  const data = await api.get<{ chunks?: Passage[] }>(`/corpora/${encodeURIComponent(corpusId)}/files/${encodeURIComponent(fileId)}/chunks`)
  return data.chunks ?? []
}

export async function listCollections(): Promise<Collection[]> {
  const data = await api.get<{ corpora?: CorpusRow[] }>('/corpora')
  return (data.corpora ?? []).map(toCollection)
}

export async function getCollection(id: string): Promise<Collection> {
  return toCollection(await api.get<CorpusRow>(`/corpora/${encodeURIComponent(id)}`))
}

export async function createCollection(name: string, description: string): Promise<Collection> {
  return toCollection(await api.post<CorpusRow>('/corpora', { name, description }))
}

export async function updateCollection(id: string, name: string, description: string): Promise<Collection> {
  return toCollection(await api.put<CorpusRow>(`/corpora/${encodeURIComponent(id)}`, { name, description }))
}

export function deleteCollection(id: string) {
  return api.delete<void>(`/corpora/${encodeURIComponent(id)}`)
}

export async function listFiles(id: string): Promise<CollectionFile[]> {
  const data = await api.get<{ files?: FileRow[] }>(`/corpora/${encodeURIComponent(id)}/files`)
  return (data.files ?? []).map((row) => ({
    fileId: row.file_id,
    name: row.filename,
    status: toStatus(row.status),
    chunkCount: row.chunk_count ?? 0,
    createdAt: row.created_at ?? 0
  }))
}

export async function listJobs(id: string): Promise<IndexingJob[]> {
  const data = await api.get<{ jobs?: JobRow[] }>(`/corpora/${encodeURIComponent(id)}/ingest/jobs`)
  return (data.jobs ?? []).map((row) => ({
    id: row.id,
    fileId: row.file_id,
    status: row.status,
    lastError: row.last_error ?? '',
    createdAt: row.created_at ?? 0,
    nextRunAt: row.next_run_at ? Date.parse(row.next_run_at) || 0 : 0
  }))
}

/** Stores the file, then puts it in the collection; the backend queues its indexing when an embedding model is set. */
export async function addDocument(id: string, file: File): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const stored = await api.upload<{ id: string }>('/files', form)
  await api.post(`/corpora/${encodeURIComponent(id)}/files`, { file_id: stored.id })
}

export function removeDocument(id: string, fileId: string) {
  return api.delete<void>(`/corpora/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`)
}

/** Tries the indexing of a file again: its failed job when there is one, a new job otherwise. */
export function retryIndexing(id: string, fileId: string, job: IndexingJob | undefined) {
  const base = `/corpora/${encodeURIComponent(id)}/ingest`
  return job ? api.post(`${base}/jobs/${encodeURIComponent(job.id)}/retry`) : api.post(base, { file_id: fileId })
}

/** Queues the indexing of every document of a collection that is still waiting (a collection of a folder source); says how many it queued. */
export async function indexCollection(id: string): Promise<number> {
  const answer = await api.post<{ queued?: number }>(`/corpora/${encodeURIComponent(id)}/ingest`, { all: true })
  return answer.queued ?? 0
}

/** Whether an embedding model is set: without one, documents are kept but never indexed. Null when it cannot be known. */
export async function isIndexingConfigured(): Promise<boolean | null> {
  try {
    const embedder = await api.get<{ is_configured?: boolean }>('/settings/embedder')
    return Boolean(embedder.is_configured)
  } catch {
    return null
  }
}
