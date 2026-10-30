import { describe, expect, it } from 'vitest'
import { cleanExcerpt } from './excerpt'

describe('cleanExcerpt', () => {
  it('drops the section line, the running header and the lone page number', () => {
    const text = 'The NIST Cybersecurity Framework (CSF) 2.0 > 3.1. CSF Profiles\nNIST CSWP 29 The NIST Cybersecurity Framework (CSF) 2.0 February 26, 2024\n\n7\n\n- Scope the Organizational Profile. Document the high-level facts.'
    expect(cleanExcerpt(text, 'The NIST Cybersecurity Framework (CSF) 2.0 > 3.1. CSF Profiles')).toBe('- Scope the Organizational Profile. Document the high-level facts.')
  })

  it('keeps the lines of a text that has none of these', () => {
    expect(cleanExcerpt('First line.\nSecond line.', '')).toBe('First line. Second line.')
  })

  it('keeps a sentence that happens to come before a number', () => {
    expect(cleanExcerpt('The fee is paid in full.\n12\nNext.', '')).toBe('The fee is paid in full. Next.')
  })

  it('keeps a first line that is not the section', () => {
    expect(cleanExcerpt('Termination\nEither party may end it.', 'Payment')).toBe('Termination Either party may end it.')
  })

  it('copes with an empty text', () => {
    expect(cleanExcerpt('', 'A')).toBe('')
  })
})
