import { describe, expect, it } from 'vitest'
import { ago, baseName, docOfFile, facetsOf, fileIdOfKey, filterDocs, folderOf, groupDocs, sortDocs, withListing, NO_FILTERS, type Hit } from './searchModel'

const hit = (over: Partial<Hit>): Hit => ({ ref: 'r', score: 0.5, corpusId: 'c1', collection: 'Legal', fileId: 'f1', path: 'Legal/a.pdf', pages: [], section: '', text: 't', ...over })

describe('names', () => {
  it('splits a path into the name and its folders', () => {
    expect(baseName('Legal/Contracts/a.pdf')).toBe('a.pdf')
    expect(folderOf('Legal/Contracts/a.pdf')).toBe('Legal / Contracts')
    expect(folderOf('a.pdf')).toBe('')
    expect(folderOf('Legal/Contracts/a.pdf', 'Legal')).toBe('Contracts')
    expect(folderOf('Legal/a.pdf', 'Legal')).toBe('')
    expect(baseName('')).toBe('')
  })

  it('reads the file out of the key of a passage', () => {
    expect(fileIdOfKey('rag/corp_1/local-abc#chunk-12')).toBe('local-abc')
    expect(fileIdOfKey('nonsense')).toBe('')
  })
})

describe('groupDocs', () => {
  const docs = groupDocs([
    hit({ ref: '1', score: 0.4, fileId: 'f1', pages: [3] }),
    hit({ ref: '2', score: 0.9, fileId: 'f2', path: 'Finance/b.xlsx', corpusId: 'c2', collection: 'Finance' }),
    hit({ ref: '3', score: 0.7, fileId: 'f1', pages: [12, 3] })
  ])

  it('makes one entry per document, with the best score and the pages of all its passages', () => {
    expect(docs.map((doc) => doc.fileId)).toEqual(['f1', 'f2'])
    expect(docs[0].hits).toHaveLength(2)
    expect(docs[0].score).toBe(0.7)
    expect(docs[0].pages).toEqual([3, 12])
    expect(docs[1].kind).toBe('xlsx')
  })

  it('does not merge two files with the same id in two collections', () => {
    expect(groupDocs([hit({ corpusId: 'c1' }), hit({ corpusId: 'c2', collection: 'Other' })])).toHaveLength(2)
  })

  it('counts documents, not passages, in the facets', () => {
    const facets = facetsOf(docs)
    // Equal counts: by name.
    expect(facets.collections).toEqual([
      { id: 'c2', name: 'Finance', count: 1 },
      { id: 'c1', name: 'Legal', count: 1 }
    ])
    expect(facets.kinds).toEqual([
      { kind: 'pdf', count: 1 },
      { kind: 'xlsx', count: 1 }
    ])
  })

  it('narrows by collection and by kind, and sorts', () => {
    expect(filterDocs(docs, NO_FILTERS)).toHaveLength(2)
    expect(filterDocs(docs, { collectionIds: new Set(['c2']), kind: null }).map((d) => d.fileId)).toEqual(['f2'])
    expect(filterDocs(docs, { collectionIds: new Set(), kind: 'pdf' }).map((d) => d.fileId)).toEqual(['f1'])
    expect(sortDocs(docs, 'relevance').map((d) => d.fileId)).toEqual(['f2', 'f1'])
    expect(sortDocs(docs, 'name').map((d) => d.name)).toEqual(['a.pdf', 'b.xlsx'])
  })
})

describe('listing', () => {
  const listed = docOfFile({ id: 'c1', name: 'Legal' }, { fileId: 'f1', name: 'Legal/Contracts/a.pdf', chunkCount: 12, createdAt: 1000 })

  it('lists a file as a document with no passage matched, without repeating the collection as a folder', () => {
    expect(listed).toMatchObject({ name: 'a.pdf', folder: 'Contracts', kind: 'pdf', chunkCount: 12, addedAt: 1000, hits: [] })
  })

  it('keeps the preview of a listed document, and none when there is none', () => {
    const withPreview = docOfFile({ id: 'c1', name: 'Legal' }, { fileId: 'f2', name: 'b.pdf', chunkCount: 3, createdAt: 5, preview: 'The audit committee meets quarterly.' })
    expect(withPreview.preview).toBe('The audit committee meets quarterly.')
    expect('preview' in listed).toBe(false)
  })

  it('gives the documents of a search what the listing knows of them, and sorts by recency', () => {
    const found = groupDocs([hit({ fileId: 'f1', path: 'Legal/Contracts/a.pdf' })])
    expect(withListing(found, [listed])[0]).toMatchObject({ addedAt: 1000, chunkCount: 12, hits: [expect.anything()] })
    const newer = { ...listed, key: 'k2', name: 'b.pdf', addedAt: 2000 }
    expect(sortDocs([listed, newer], 'recent').map((doc) => doc.name)).toEqual(['b.pdf', 'a.pdf'])
  })
})

describe('ago', () => {
  const now = 1_000_000 * 1000
  it('says how long ago', () => {
    expect(ago(0, now)).toBe('')
    expect(ago(1_000_000 - 30, now)).toBe('just now')
    expect(ago(1_000_000 - 5 * 60, now)).toBe('5 minutes ago')
    expect(ago(1_000_000 - 3600, now)).toBe('1 hour ago')
    expect(ago(1_000_000 - 3 * 86400, now)).toBe('3 days ago')
  })
})
