import { describe, expect, it } from 'vitest'
import { highlight, queryTerms, snippet } from './highlight'

describe('queryTerms', () => {
  it('keeps the words once, without case, accents or punctuation', () => {
    expect(queryTerms('Résumé "notice" (period), notice 90-days')).toEqual(['resume', 'notice', 'period', '90', 'days'])
    expect(queryTerms('  ...  ')).toEqual([])
  })

  it('leaves out the filler words of a question, unless it is made of nothing else', () => {
    expect(queryTerms('What should a company do after intruders get into its computers?')).toEqual(['company', 'intruders', 'get', 'computers'])
    expect(queryTerms('what is it')).toEqual(['what', 'is', 'it'])
  })
})

describe('highlight', () => {
  it('marks the whole words of the query, whatever their case or accents', () => {
    expect(highlight('The Résumé of the notice period', ['resume', 'notice'])).toEqual([
      { text: 'The ', hit: false },
      { text: 'Résumé', hit: true },
      { text: ' of the ', hit: false },
      { text: 'notice', hit: true },
      { text: ' period', hit: false }
    ])
  })

  it('does not mark a word that only contains one of the terms', () => {
    expect(highlight('noticeboard', ['notice'])).toEqual([{ text: 'noticeboard', hit: false }])
  })

  it('returns the text as it is with no term', () => {
    expect(highlight('plain', [])).toEqual([{ text: 'plain', hit: false }])
  })
})

describe('snippet', () => {
  it('gives a short text whole', () => {
    expect(snippet('A  short\ntext', ['text'])).toBe('A short text')
  })

  it('centres a long text on the first word of the query it holds', () => {
    const text = `${'filler '.repeat(60)}the notice period is ninety days ${'more '.repeat(60)}`
    const out = snippet(text, ['notice'], 120)
    expect(out.startsWith('...')).toBe(true)
    expect(out).toContain('notice period is ninety days')
    expect(out.length).toBeLessThanOrEqual(130)
  })

  it('takes the beginning when no term is in the text', () => {
    expect(snippet('word '.repeat(100), ['absent'], 50).endsWith('...')).toBe(true)
  })
})
