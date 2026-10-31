import { describe, expect, it } from 'vitest'
import type { CollectionFile } from './collectionsApi'
import { arrange, DEFAULT_VIEW, failedFiles, formatOf } from './documentOrder'
import type { FileState } from './fileStatus'

const file = (name: string, status: CollectionFile['status'] = 'pending'): CollectionFile => ({ fileId: name, name, status, chunkCount: 0, createdAt: 0 })
const TONES: Record<string, FileState> = {
  'a.pdf': { tone: 'failed', label: 'Failed' },
  'b.docx': { tone: 'ready', label: 'Indexed' },
  'c.md': { tone: 'working', label: 'Indexing' },
  'd.pptx': { tone: 'waiting', label: 'Not indexed' },
  'e.txt': { tone: 'ready', label: 'Indexed' }
}
const stateOf = (f: CollectionFile) => TONES[f.name] ?? { tone: 'waiting', label: 'Not indexed' }
const names = (list: CollectionFile[]) => list.map((f) => f.name)
const all = [file('a.pdf', 'failed'), file('b.docx', 'ingested'), file('c.md'), file('d.pptx'), file('e.txt', 'ingested')]

describe('formatOf', () => {
  it('reads the kind of a document from its extension, whatever the case', () => {
    expect(formatOf('notes.MD')).toBe('text')
    expect(formatOf('Folder/report.docx')).toBe('word')
    expect(formatOf('paper.pdf')).toBe('pdf')
    expect(formatOf('deck.pptx')).toBe('other')
    expect(formatOf('no-extension')).toBe('other')
  })
})

describe('arrange', () => {
  it('sorts by format, in the order the documents are indexed, and by name inside a format', () => {
    expect(names(arrange(all, stateOf, DEFAULT_VIEW))).toEqual(['c.md', 'e.txt', 'b.docx', 'a.pdf', 'd.pptx'])
  })

  it('sorts by name in both directions, reading numbers as numbers', () => {
    const numbered = [file('doc10.txt'), file('doc2.txt'), file('Doc1.txt')]
    expect(names(arrange(numbered, stateOf, { ...DEFAULT_VIEW, sort: 'name-asc' }))).toEqual(['Doc1.txt', 'doc2.txt', 'doc10.txt'])
    expect(names(arrange(numbered, stateOf, { ...DEFAULT_VIEW, sort: 'name-desc' }))).toEqual(['doc10.txt', 'doc2.txt', 'Doc1.txt'])
  })

  it('puts the failures first when sorting by state, the indexed ones last', () => {
    expect(names(arrange(all, stateOf, { ...DEFAULT_VIEW, sort: 'state' }))).toEqual(['a.pdf', 'c.md', 'd.pptx', 'b.docx', 'e.txt'])
  })

  it('filters by format and by state, together', () => {
    expect(names(arrange(all, stateOf, { ...DEFAULT_VIEW, format: 'pdf' }))).toEqual(['a.pdf'])
    expect(names(arrange(all, stateOf, { ...DEFAULT_VIEW, state: 'indexed' }))).toEqual(['e.txt', 'b.docx'])
    expect(names(arrange(all, stateOf, { ...DEFAULT_VIEW, state: 'failed' }))).toEqual(['a.pdf'])
    expect(names(arrange(all, stateOf, { ...DEFAULT_VIEW, state: 'working' }))).toEqual(['c.md'])
    expect(names(arrange(all, stateOf, { ...DEFAULT_VIEW, state: 'waiting' }))).toEqual(['d.pptx'])
    expect(arrange(all, stateOf, { ...DEFAULT_VIEW, format: 'word', state: 'failed' })).toEqual([])
  })

  it('leaves the list it is given as it was', () => {
    const before = names(all)
    arrange(all, stateOf, { ...DEFAULT_VIEW, sort: 'name-desc' })
    expect(names(all)).toEqual(before)
  })
})

describe('failedFiles', () => {
  it('names the documents Retry all failed starts again', () => {
    expect(names(failedFiles(all, stateOf))).toEqual(['a.pdf'])
  })
})
