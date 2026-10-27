import type { CollectionFile, IndexingJob } from './collectionsApi'

export type FileState = { tone: 'ready' | 'working' | 'failed' | 'waiting'; label: string; detail?: string }

/** What to tell about a file: indexed, being indexed, failed (with the reason), or kept with no indexing job at all. */
export function fileState(file: CollectionFile, job: IndexingJob | undefined): FileState {
  if (file.status === 'ingested') return { tone: 'ready', label: 'Indexed' }
  // A job on its way wins over the state a failed earlier attempt left on the file: it is being tried again.
  if (job?.status === 'running' || job?.status === 'pending') return { tone: 'working', label: job.status === 'running' ? 'Indexing' : 'Waiting' }
  if (file.status === 'failed') return { tone: 'failed', label: 'Failed', detail: job?.lastError || undefined }
  if (job?.status === 'failed') return { tone: 'failed', label: 'Failed', detail: job.lastError || undefined }
  if (!job) return { tone: 'waiting', label: 'Not indexed', detail: 'Indexing has not started.' }
  return { tone: 'working', label: job?.status === 'running' ? 'Indexing' : 'Waiting' }
}

/** Files still on their way to an index: the ones to keep watching. */
export function isInProgress(file: CollectionFile, state: FileState): boolean {
  return file.status !== 'ingested' && state.tone === 'working'
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}
