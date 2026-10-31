import type { CollectionFile, IndexingJob } from './collectionsApi'

/** `queued` is a document that waits its turn, quietly; `working` is the one being indexed. */
export type FileState = { tone: 'ready' | 'working' | 'queued' | 'failed' | 'waiting'; label: string; detail?: string; note?: string }

/** Starts the last error of a job that waits for the quota of the embedding provider (the backend writes it): the queue is paused, nothing failed. */
export const QUOTA_PAUSED_PREFIX = 'Paused:'

/** What to tell about a file: indexed, being indexed, failed (with the reason), or kept with no indexing job at all. */
export function fileState(file: CollectionFile, job: IndexingJob | undefined): FileState {
  if (file.status === 'ingested') {
    // Indexed by its words only: the reading worked and the embedding did not, so it is found by keywords until the vectors are made.
    return file.keywordsOnly ? { tone: 'ready', label: 'Indexed', note: 'keywords only', detail: file.keywordsReason || undefined } : { tone: 'ready', label: 'Indexed' }
  }
  // A job on its way wins over the state a failed earlier attempt left on the file: it is being tried again.
  if (job?.status === 'running') return { tone: 'working', label: 'Indexing' }
  if (job?.status === 'pending') return isPaused(job) ? { tone: 'queued', label: 'Waiting', detail: job.lastError } : { tone: 'queued', label: 'Waiting' }
  if (file.status === 'failed') return { tone: 'failed', label: 'Failed', detail: job?.lastError || undefined }
  if (job?.status === 'failed') return { tone: 'failed', label: 'Failed', detail: job.lastError || undefined }
  if (!job) return { tone: 'waiting', label: 'Not indexed', detail: 'Indexing has not started.' }
  return { tone: 'queued', label: 'Waiting' }
}

/** Files still on their way to an index: the ones to keep watching. */
export function isInProgress(file: CollectionFile, state: FileState): boolean {
  return file.status !== 'ingested' && (state.tone === 'working' || state.tone === 'queued')
}

function isPaused(job: IndexingJob): boolean {
  return job.lastError.startsWith(QUOTA_PAUSED_PREFIX)
}

/** The jobs held back by the quota of the embedding provider: what the page says the queue is waiting for, and until when. */
export function quotaPause(jobs: IndexingJob[]): { message: string; until: number } | null {
  const held = jobs.filter((job) => job.status === 'pending' && isPaused(job))
  if (held.length === 0) return null
  const until = Math.min(...held.map((job) => job.nextRunAt).filter((at) => at > 0), Number.POSITIVE_INFINITY)
  return { message: held[0].lastError.slice(QUOTA_PAUSED_PREFIX.length).trim(), until: Number.isFinite(until) ? until : 0 }
}

/** "40 s", "3 min": how long is left until a time, rounded up, nothing once it is past. */
export function timeLeft(until: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((until - now) / 1000))
  return seconds < 90 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}
