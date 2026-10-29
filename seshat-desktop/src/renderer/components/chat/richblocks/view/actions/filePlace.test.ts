import { describe, expect, it } from 'vitest'
import { filePlace } from './filePlace'

describe('filePlace', () => {
  it('opens a text file in the Files panel', () => {
    expect(filePlace('C:\\work\\notes.md')).toEqual({ where: 'panel', path: 'C:\\work\\notes.md' })
    expect(filePlace('/home/me/app/main.go')).toEqual({ where: 'panel', path: '/home/me/app/main.go' })
    expect(filePlace('Makefile', undefined)).toEqual({ where: 'panel', path: 'Makefile' })
  })

  it('hands a file the panel cannot show to the system', () => {
    expect(filePlace('C:\\work\\report.PDF').where).toBe('system')
    expect(filePlace('/tmp/photo.jpeg').where).toBe('system')
    expect(filePlace('data/archive.zip', 'C:\\work').where).toBe('system')
  })

  it('puts a relative path in the project', () => {
    expect(filePlace('src/main.go', 'C:\\work\\app').path).toBe('C:\\work\\app\\src/main.go')
    expect(filePlace('./docs/a.md', '/home/me/app').path).toBe('/home/me/app/docs/a.md')
    expect(filePlace('docs/a.md', '/home/me/app/').path).toBe('/home/me/app/docs/a.md')
  })

  it('leaves an absolute path and a path with no project as they are', () => {
    expect(filePlace('D:\\x\\y.txt', 'C:\\work').path).toBe('D:\\x\\y.txt')
    expect(filePlace('src/a.ts').path).toBe('src/a.ts')
  })
})
