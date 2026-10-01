import { describe, expect, it } from 'vitest'
import { nextPastedTextFilename } from './pastedTextFilename'

describe('nextPastedTextFilename', () => {
  it('uses the base name when nothing is pasted yet', () => {
    expect(nextPastedTextFilename([])).toBe('Pasted text.txt')
  })

  it('ignores attachments with unrelated names', () => {
    expect(nextPastedTextFilename([{ filename: 'report.pdf' }])).toBe('Pasted text.txt')
  })

  it('numbers the next paste once the base name is taken', () => {
    expect(nextPastedTextFilename([{ filename: 'Pasted text.txt' }])).toBe('Pasted text 2.txt')
  })

  it('skips every number already in use', () => {
    const existing = [
      { filename: 'Pasted text.txt' },
      { filename: 'Pasted text 2.txt' },
      { filename: 'Pasted text 3.txt' },
    ]
    expect(nextPastedTextFilename(existing)).toBe('Pasted text 4.txt')
  })
})
