import { describe, expect, it } from 'vitest'
import { groupSources, pagesLabel } from './groupSources'

const source = (n: number, documentId: string, page: number) => ({ n, documentId, page, excerpt: `passage ${n}` })

describe('groupSources', () => {
  it('makes one entry per document, whatever the number of passages', () => {
    const groups = groupSources([source(1, 'a', 12), source(2, 'b', 4), source(3, 'a', 3), source(4, 'a', 12)])
    expect(groups.map((group) => group.documentId)).toEqual(['a', 'b'])
    expect(groups[0].sources.map((item) => item.n)).toEqual([1, 3, 4])
    expect(groups[0].pages).toEqual([3, 12])
  })

  it('has nothing to group without sources', () => {
    expect(groupSources([])).toEqual([])
  })
})

describe('pagesLabel', () => {
  it('writes one page or several', () => {
    expect(pagesLabel([12])).toBe('p. 12')
    expect(pagesLabel([3, 12])).toBe('pp. 3, 12')
  })
})
