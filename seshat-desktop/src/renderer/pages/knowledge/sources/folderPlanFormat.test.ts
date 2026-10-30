import { describe, expect, it } from 'vitest'
import type { FolderPlan } from './folderPlanApi'
import { createdSentence, formatSize, planSentence, plural, reasonLabel, reasonsOf, shortPath, suggestedMergeName } from './folderPlanFormat'

const plan = (over: Partial<FolderPlan> = {}): FolderPlan => ({
  id: 'p',
  root: '/archive',
  listed: 10,
  collections: [
    { index: 0, name: 'Contracts', file_count: 6, bytes: 600, folders: ['Contracts'], sample: [] },
    { index: 1, name: 'Notes', file_count: 2, bytes: 20, folders: ['Notes'], sample: [] },
    { index: 2, name: 'Invoices', file_count: 1, bytes: 5, folders: ['Invoices'], sample: [] }
  ],
  excluded_count: 0,
  excluded_by_reason: {},
  excluded: [],
  duplicate_count: 0,
  duplicates: [],
  ...over
})

describe('formatSize', () => {
  it('writes a size for a person', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(950)).toBe('950 B')
    expect(formatSize(12_345)).toBe('12.3 KB')
    expect(formatSize(3_400_000)).toBe('3.4 MB')
    expect(formatSize(250_000_000)).toBe('250 MB')
  })

  it('does not break on what is not a size', () => {
    expect(formatSize(Number.NaN)).toBe('0 B')
    expect(formatSize(-4)).toBe('0 B')
  })
})

describe('reasonLabel', () => {
  it('turns a reason into words and keeps what it does not know', () => {
    expect(reasonLabel('hidden')).toBe('Hidden files and folders')
    expect(reasonLabel('unreadable: permission denied')).toBe('Could not be read')
    expect(reasonLabel('something new')).toBe('something new')
  })
})

describe('reasonsOf', () => {
  it('puts the most frequent reason first', () => {
    const labels = reasonsOf({ excluded_by_reason: { hidden: 2, 'empty file': 9, 'symbolic link': 2 } }).map((r) => r.label)
    expect(labels).toEqual(['Empty files', 'Hidden files and folders', 'Links (not followed)'])
  })
})

describe('planSentence', () => {
  it('says what the plan holds and leaves out only what is there', () => {
    expect(planSentence(plan())).toBe('9 files in 3 collections')
    expect(planSentence(plan({ excluded_count: 4, duplicate_count: 1 }))).toBe('9 files in 3 collections, 4 left out, 1 duplicate')
  })

  it('writes the singular', () => {
    expect(plural(1, 'file')).toBe('1 file')
    expect(plural(0, 'file')).toBe('0 files')
    expect(plural(1, 'entry', 'entries')).toBe('1 entry')
    expect(plural(5, 'entry', 'entries')).toBe('5 entries')
    expect(planSentence(plan({ collections: [plan().collections[2]] }))).toBe('1 file in 1 collection')
  })
})

describe('suggestedMergeName', () => {
  it('takes the name of the biggest collection', () => {
    expect(suggestedMergeName(plan(), [1, 0])).toBe('Contracts')
  })

  it('gives nothing for no collection', () => {
    expect(suggestedMergeName(plan(), [])).toBe('')
  })
})

describe('shortPath', () => {
  it('keeps the last segments of a long path', () => {
    expect(shortPath('C:\\Users\\me\\Documents\\Archive\\2021')).toBe('.../Archive/2021')
    expect(shortPath('/data/archive/2021')).toBe('.../archive/2021')
    expect(shortPath('Archive/2021')).toBe('Archive/2021')
  })
})

describe('createdSentence', () => {
  it('says how many collections were made and how many files wait', () => {
    const made = [
      { id: 'a', name: 'Legal', file_count: 48 },
      { id: 'b', name: 'Finance', file_count: 47 }
    ]
    expect(createdSentence(made)).toBe('2 collections created, 95 files waiting to be indexed.')
    expect(createdSentence([{ id: 'a', name: 'Legal', file_count: 1 }])).toBe('1 collection created, 1 file waiting to be indexed.')
  })
})
