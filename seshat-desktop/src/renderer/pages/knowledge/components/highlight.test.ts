import { describe, expect, it } from 'vitest'
import { splitHighlight } from './highlight'

describe('splitHighlight', () => {
  it('marks the cited passage and keeps the text around it', () => {
    expect(splitHighlight('Before. The notice is sixty days. After.', 'The notice is sixty days.')).toEqual([
      { text: 'Before. ', mark: false },
      { text: 'The notice is sixty days.', mark: true },
      { text: ' After.', mark: false }
    ])
  })

  it('returns the page unmarked when the passage is not on it', () => {
    expect(splitHighlight('Some text.', 'Other')).toEqual([{ text: 'Some text.', mark: false }])
    expect(splitHighlight('Some text.', '')).toEqual([{ text: 'Some text.', mark: false }])
  })
})
