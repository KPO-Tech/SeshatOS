import { describe, expect, it } from 'vitest'
import type { CollectionFile, IndexingJob } from './collectionsApi'
import { fileState, isInProgress, plural, quotaPause, timeLeft } from './fileStatus'

const file = (status: CollectionFile['status']): CollectionFile => ({ fileId: 'f1', name: 'a.pdf', status, chunkCount: 0, createdAt: 0 })
const job = (status: string, lastError = '', nextRunAt = 0): IndexingJob => ({ id: 'j1', fileId: 'f1', status, lastError, createdAt: 0, nextRunAt })

describe('fileState', () => {
  it('says indexed for an ingested file', () => {
    expect(fileState(file('ingested'), undefined)).toEqual({ tone: 'ready', label: 'Indexed' })
  })

  it('gives the reason of a failure', () => {
    expect(fileState(file('failed'), job('failed', 'unsupported format'))).toMatchObject({ tone: 'failed', detail: 'unsupported format' })
    expect(fileState(file('pending'), job('failed', 'timeout'))).toMatchObject({ tone: 'failed', detail: 'timeout' })
  })

  it('tells a file with no job apart from one being indexed', () => {
    expect(fileState(file('pending'), undefined)).toMatchObject({ tone: 'waiting', label: 'Not indexed' })
    expect(fileState(file('pending'), job('running'))).toEqual({ tone: 'working', label: 'Indexing' })
    expect(fileState(file('pending'), job('queued'))).toEqual({ tone: 'queued', label: 'Waiting' })
  })

  it('shows a file as being indexed when a new attempt runs after a failed one', () => {
    expect(fileState(file('failed'), job('running'))).toEqual({ tone: 'working', label: 'Indexing' })
    expect(fileState(file('failed'), job('pending'))).toEqual({ tone: 'queued', label: 'Waiting' })
    expect(isInProgress(file('failed'), fileState(file('failed'), job('running')))).toBe(true)
  })

  it('keeps watching only what is still on its way', () => {
    expect(isInProgress(file('pending'), fileState(file('pending'), job('running')))).toBe(true)
    expect(isInProgress(file('pending'), fileState(file('pending'), undefined))).toBe(false)
    expect(isInProgress(file('ingested'), fileState(file('ingested'), undefined))).toBe(false)
  })
})

describe('a job held back by the quota of the embedding provider', () => {
  const held = job('pending', 'Paused: the quota of the embedding provider is used up. Indexing goes on by itself.', 5000)

  it('is waiting, not failed, and says why', () => {
    expect(fileState(file('pending'), held)).toMatchObject({ tone: 'queued', label: 'Waiting', detail: held.lastError })
    expect(fileState(file('failed'), held).tone).toBe('queued')
    expect(isInProgress(file('pending'), fileState(file('pending'), held))).toBe(true)
  })

  it('is told to the page as one pause, with the earliest time it ends', () => {
    expect(quotaPause([job('running'), job('pending', 'ordinary retry')])).toBeNull()
    const pause = quotaPause([held, job('pending', held.lastError, 3000), job('completed')])
    expect(pause).toEqual({ message: 'the quota of the embedding provider is used up. Indexing goes on by itself.', until: 3000 })
  })

  it('counts the time left, rounded up', () => {
    expect(timeLeft(41_200, 1_000)).toBe('41 s')
    expect(timeLeft(1_000, 5_000)).toBe('0 s')
    expect(timeLeft(300_000, 0)).toBe('5 min')
  })
})

describe('plural', () => {
  it('counts', () => {
    expect(plural(1, 'document', 'documents')).toBe('1 document')
    expect(plural(0, 'document', 'documents')).toBe('0 documents')
  })
})
