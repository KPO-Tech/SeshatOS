import { describe, expect, it } from 'vitest'
import type { Passage } from './knowledgeSearchResults'
import { groupPassages, kindOfFile, pagesLabel } from './passageSources'

const passage = (ref: string, collection: string, file: string, pages: number[]): Passage => ({ ref, score: 0.5, collection, file, pages, section: '', text: `text of ${ref}` })

describe('groupPassages', () => {
  it('makes one entry per document, whatever the number of passages', () => {
    const groups = groupPassages([
      passage('k000001', 'Legal', 'Template.docx', [12]),
      passage('k000002', 'Procurement', 'Framework.pdf', [4]),
      passage('k000003', 'Legal', 'Template.docx', [3, 12]),
      passage('k000004', 'Legal', 'Template.docx', [12])
    ])
    expect(groups.map((group) => group.title)).toEqual(['Template.docx', 'Framework.pdf'])
    expect(groups[0].passages.map((item) => item.ref)).toEqual(['k000001', 'k000003', 'k000004'])
    expect(groups[0].pages).toEqual([3, 12])
  })

  it('keeps two documents with the same name in different collections apart', () => {
    expect(groupPassages([passage('k000001', 'Legal', 'Policy.pdf', []), passage('k000002', 'People', 'Policy.pdf', [])])).toHaveLength(2)
  })

  it('groups a passage with no file name under its collection', () => {
    expect(groupPassages([passage('k000001', 'People', '', [])])[0].title).toBe('People')
  })

  it('has nothing to group without passages', () => {
    expect(groupPassages([])).toEqual([])
  })
})

describe('kindOfFile', () => {
  it('reads the kind from the extension, whatever its case', () => {
    expect(kindOfFile('Contract.PDF')).toBe('pdf')
    expect(kindOfFile('notes.docx')).toBe('docx')
    expect(kindOfFile('budget.csv')).toBe('xlsx')
    expect(kindOfFile('deck.pptx')).toBe('pptx')
    expect(kindOfFile('README.md')).toBe('md')
  })

  it('has a kind for what it does not know', () => {
    expect(kindOfFile('archive.zip')).toBe('other')
    expect(kindOfFile('no extension')).toBe('other')
    expect(kindOfFile('')).toBe('other')
  })
})

describe('pagesLabel', () => {
  it('writes one page, several, or none', () => {
    expect(pagesLabel([12])).toBe('p. 12')
    expect(pagesLabel([3, 12])).toBe('pp. 3, 12')
    expect(pagesLabel([])).toBe('')
  })
})
