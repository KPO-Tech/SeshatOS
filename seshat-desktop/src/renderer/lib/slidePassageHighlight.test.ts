import { describe, expect, it } from 'vitest'
import { slideNumberOf, slideNumbersOf, slideText } from './slidePassageHighlight'

describe('slideNumbersOf', () => {
  it('reads the slides a passage holds, from the marks of the index', () => {
    expect(slideNumbersOf('## Slide 5\n\nStandard Oil\n\n## Slide 6\n\nThe Act')).toEqual([5, 6])
    expect(slideNumberOf('## Slide 7\n\nText')).toBe(7)
  })

  it('reads the mark of a passage that continues a slide', () => {
    expect(slideNumberOf('Slide 4 > SECTION 01\n\nTrusts, pools')).toBe(4)
    expect(slideNumberOf('Slide 29  CLOSING TAKEAWAYS')).toBe(29)
  })

  it('names no slide when the text has no mark, and ignores a mention in a sentence', () => {
    expect(slideNumbersOf('The company sold it. See Slide 3 for details.')).toEqual([])
    expect(slideNumberOf('plain text')).toBeUndefined()
  })
})

describe('slideText', () => {
  it('drops the marks and image notes the index added, keeps the text', () => {
    const text = '## Slide 1\n\n[Image: hero.jpg]\n\nSAMPLE TRAINING DECK\n\nSlide 2 > AGENDA\n\nWhat this deck covers'
    expect(slideText(text).split('\n').filter(Boolean)).toEqual(['SAMPLE TRAINING DECK', 'What this deck covers'])
  })
})
