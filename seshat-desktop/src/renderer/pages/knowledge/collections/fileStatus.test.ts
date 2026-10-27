import { describe, expect, it } from 'vitest'
import type { CollectionFile, IndexingJob } from './collectionsApi'
import { fileState, isInProgress, plural } from './fileStatus'

const file = (status: CollectionFile['status']): CollectionFile => ({ fileId: 'f1', name: 'a.pdf', status, chunkCount: 0, createdAt: 0 })
const job = (status: string, lastError = ''): IndexingJob => ({ id: 'j1', fileId: 'f1', status, lastError, createdAt: 0 })

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
    expect(fileState(file('pending'), job('queued'))).toEqual({ tone: 'working', label: 'Waiting' })
  })

  it('shows a file as being indexed when a new attempt runs after a failed one', () => {
    expect(fileState(file('failed'), job('running'))).toEqual({ tone: 'working', label: 'Indexing' })
    expect(fileState(file('failed'), job('pending'))).toEqual({ tone: 'working', label: 'Waiting' })
    expect(isInProgress(file('failed'), fileState(file('failed'), job('running')))).toBe(true)
  })

  it('keeps watching only what is still on its way', () => {
    expect(isInProgress(file('pending'), fileState(file('pending'), job('running')))).toBe(true)
    expect(isInProgress(file('pending'), fileState(file('pending'), undefined))).toBe(false)
    expect(isInProgress(file('ingested'), fileState(file('ingested'), undefined))).toBe(false)
  })
})

describe('plural', () => {
  it('counts', () => {
    expect(plural(1, 'document', 'documents')).toBe('1 document')
    expect(plural(0, 'document', 'documents')).toBe('0 documents')
  })
})
