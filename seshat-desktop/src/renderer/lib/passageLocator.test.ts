import { describe, expect, it } from 'vitest'
import { locatePassage, unitsCovering, wordsOf } from './passageLocator'

describe('wordsOf', () => {
  it('drops marks, punctuation and case', () => {
    expect(wordsOf('## Financial results\n| $5,603 / 968 | 1% |')).toEqual(['financial', 'results', '5', '603', '968', '1'])
  })
})

describe('locatePassage', () => {
  const page = wordsOf('Header of the page. The total annual amount to be paid, excluding taxes, for the year 2009 for the total provision of the services. Footer 12')
  it('finds the words of the page that the passage covers', () => {
    const passage = wordsOf('7.1. TOTAL ANNUAL AMOUNT The total annual amount to be paid, excluding taxes, for the year 2009 for the total provision of the services')
    const found = locatePassage(page, passage)
    expect(found).not.toBeNull()
    expect(page[found!.start]).toBe('the')
    expect(page[found!.end]).toBe('services')
  })

  it('does not find a passage the page does not hold', () => {
    expect(locatePassage(page, wordsOf('The supplier shall deliver the goods within thirty days of the order being placed'))).toBeNull()
  })

  it('does not take one shared phrase for the passage', () => {
    expect(locatePassage(page, wordsOf('Nothing else here but the total annual amount appears in a different sentence altogether'))).toBeNull()
  })

  it('finds a passage whose table was read in another order, within the drift', () => {
    const table = wordsOf('Interest income 4 635 4 464 4 Interest expense 1 070 895 20 Net 1 335 1 491 10')
    const found = locatePassage(table, wordsOf('Interest income 4 635 4 464 4 Interest expense 1 070 895 20'))
    expect(found).not.toBeNull()
    expect(found!.start).toBe(0)
  })
})

describe('unitsCovering', () => {
  it('names the units that hold the words from start to end', () => {
    // Units of 3, 0, 2, 4 words: words 0-2, none, 3-4, 5-8.
    expect(unitsCovering([3, 0, 2, 4], 2, 5)).toEqual([0, 2, 3])
    expect(unitsCovering([3, 0, 2, 4], 3, 4)).toEqual([2])
  })
})
