import { describe, expect, it } from 'vitest'
import { locatePassageInSheets, sheetNamesIn, type Sheet } from './sheetPassageLocator'

const sheets: Sheet[] = [
  {
    name: 'Sales',
    rows: [
      ['Region', 'Q1', 'Q2'],
      ['Region 1', '100', '120'],
      ['Region 2', '200', '240'],
      ['Region 3', '300', '360'],
      ['Region 4', '400', '480'],
    ],
  },
  {
    name: 'Staff',
    rows: [
      ['Name', 'Role'],
      ['Alice', 'Engineer'],
      ['Bob', 'Designer'],
      ['Carol', 'Manager'],
    ],
  },
]

// What the reader writes for this workbook: the sheet title, then the rows as a Markdown table.
const staffPassage = '## Staff\n\n| Name | Role |\n| --- | --- |\n| Alice | Engineer |\n| Bob | Designer |\n| Carol | Manager |'

describe('sheetNamesIn', () => {
  it('reads the sheet titles the index wrote', () => {
    expect(sheetNamesIn('## Sales\n\n| a | b |\n\n## Staff\n\n| c |')).toEqual(['Sales', 'Staff'])
    expect(sheetNamesIn('| a | b |')).toEqual([])
  })
})

describe('locatePassageInSheets', () => {
  it('finds the sheet a passage names, and the cells that hold it', () => {
    const place = locatePassageInSheets(sheets, staffPassage)
    expect(place?.sheet).toBe(1)
    expect(place?.cells).toContainEqual([3, 1])
    expect(place?.cells.every(([row]) => row >= 0 && row <= 3)).toBe(true)
  })

  it('finds a passage that starts in the middle of a sheet, without its title, in the sheet that holds it', () => {
    const place = locatePassageInSheets(sheets, '| Region 3 | 300 | 360 |\n| Region 4 | 400 | 480 |')
    expect(place?.sheet).toBe(0)
    expect(place?.cells.map(([row]) => row)).toEqual(expect.arrayContaining([3, 4]))
    expect(place?.cells.map(([row]) => row)).not.toContain(1)
  })

  it('finds nothing when no sheet holds the passage', () => {
    expect(locatePassageInSheets(sheets, '## Staff\n\n| Dave | Pilot |\n| Erin | Chef |')).toBeNull()
  })
})
