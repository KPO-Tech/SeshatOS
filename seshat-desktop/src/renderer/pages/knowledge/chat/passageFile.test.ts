import { describe, expect, it } from 'vitest'
import { fileNamed } from './passageFile'

const files = [
  { fileId: 'f1', name: 'Legal/Contracts/a.pdf' },
  { fileId: 'f2', name: 'Legal/b.pdf' },
  { fileId: 'f3', name: 'Other/b.pdf' }
]

describe('fileNamed', () => {
  it('finds the file by its name with the folders', () => {
    expect(fileNamed(files, 'Legal/b.pdf')).toBe('f2')
  })
  it('finds the file by its name alone when only one has it', () => {
    expect(fileNamed(files, 'a.pdf')).toBe('f1')
  })
  it('does not choose between two files of the same name', () => {
    expect(fileNamed(files, 'b.pdf')).toBeNull()
  })
  it('finds nothing for an unknown or empty name', () => {
    expect(fileNamed(files, 'c.pdf')).toBeNull()
    expect(fileNamed(files, '')).toBeNull()
  })
})
