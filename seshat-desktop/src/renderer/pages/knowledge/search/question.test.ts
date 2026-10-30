import { describe, expect, it } from 'vitest'
import { looksLikeQuestion } from './question'

describe('looksLikeQuestion', () => {
  it('is true for a sentence with a question mark, or that opens as a question', () => {
    expect(looksLikeQuestion('According to NIST CSWP 29, how should an organization scope its Organizational Profile?')).toBe(true)
    expect(looksLikeQuestion('What is the notice period')).toBe(true)
    expect(looksLikeQuestion('Quelle est la durée du préavis ?')).toBe(true)
    expect(looksLikeQuestion('notice period?')).toBe(true)
  })

  it('is false for a few keywords, a number or a code', () => {
    expect(looksLikeQuestion('notice period')).toBe(false)
    expect(looksLikeQuestion('OSHA-3151 gloves')).toBe(false)
    expect(looksLikeQuestion('what is')).toBe(false)
    expect(looksLikeQuestion('')).toBe(false)
  })
})
