import { describe, expect, it } from 'vitest'
import type { Passage } from '@renderer/pages/knowledge/chat/knowledgeSearchResults'
import { excerptBody, isLongExcerpt, relevance, searchSummary, sectionTrail } from './knowledgeSearchSummary'

const passage = (file: string, ref: string): Passage => ({ ref, score: 0.5, collection: 'Legal', file, pages: [1], section: '', text: 'x' })

describe('searchSummary', () => {
  it('counts the passages and the documents they come from', () => {
    expect(searchSummary([passage('a.pdf', 'k000001'), passage('a.pdf', 'k000002'), passage('b.pdf', 'k000003')])).toBe('3 passages from 2 documents')
    expect(searchSummary([passage('a.pdf', 'k000001')])).toBe('1 passage from 1 document')
    expect(searchSummary([])).toBe('')
  })
})

describe('relevance', () => {
  it('is a whole percentage inside 0 to 100', () => {
    expect(relevance(0.6595)).toBe(66)
    expect(relevance(1.4)).toBe(100)
    expect(relevance(-0.2)).toBe(0)
    expect(relevance(NaN)).toBe(0)
  })
})

describe('sectionTrail', () => {
  it('writes a section path as a breadcrumb', () => {
    expect(sectionTrail('Personal Protective Equipment > Hand and Arm Protection')).toBe('Personal Protective Equipment › Hand and Arm Protection')
    expect(sectionTrail('Termination')).toBe('Termination')
    expect(sectionTrail('')).toBe('')
  })
})

describe('excerptBody', () => {
  it('drops a first line that only repeats the section', () => {
    expect(excerptBody('A > B\nThe text.', 'A > B')).toBe('The text.')
    expect(excerptBody('a  >  b\nThe text.', 'A > B')).toBe('The text.')
  })

  it('keeps a text that does not start with the section', () => {
    expect(excerptBody('The text.\nMore.', 'A > B')).toBe('The text.\nMore.')
    expect(excerptBody('A > B', '')).toBe('A > B')
  })
})

describe('isLongExcerpt', () => {
  it('tells a short excerpt from one that a clamp would cut', () => {
    expect(isLongExcerpt('a short line')).toBe(false)
    expect(isLongExcerpt('x'.repeat(400))).toBe(true)
    expect(isLongExcerpt('1\n2\n3\n4\n5\n6')).toBe(true)
  })
})
