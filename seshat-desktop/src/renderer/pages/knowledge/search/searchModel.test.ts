import { describe, expect, it } from 'vitest'
import { baseName, facetsOf, fileIdOfKey, filterDocs, folderOf, groupDocs, sortDocs, NO_FILTERS, type Hit } from './searchModel'

const hit = (over: Partial<Hit>): Hit => ({ ref: 'r', score: 0.5, corpusId: 'c1', collection: 'Legal', fileId: 'f1', path: 'Legal/a.pdf', pages: [], section: '', text: 't', ...over })

describe('names', () => {
  it('splits a path into the name and its folders', () => {
    expect(baseName('Legal/Contracts/a.pdf')).toBe('a.pdf')
    expect(folderOf('Legal/Contracts/a.pdf')).toBe('Legal / Contracts')
    expect(folderOf('a.pdf')).toBe('')
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
