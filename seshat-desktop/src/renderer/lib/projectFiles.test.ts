import { describe, expect, it } from 'vitest'
import { extensionOf, fileKindOf, formatBytes, joinPath, parseDelimited } from './projectFiles'

describe('fileKindOf', () => {
  it('sorts a file by what the viewer does with it', () => {
    expect(fileKindOf('README.md')).toBe('markdown')
    expect(fileKindOf('notes.MDX')).toBe('markdown')
    expect(fileKindOf('01_exploration.ipynb')).toBe('notebook')
    expect(fileKindOf('data/transactions.csv')).toBe('table')
    expect(fileKindOf('logo.PNG')).toBe('image')
    expect(fileKindOf('report.pdf')).toBe('document')
    expect(fileKindOf('deck.pptx')).toBe('document')
    expect(fileKindOf('src/models/predictor.py')).toBe('code')
    expect(fileKindOf('config.yml')).toBe('code')
    expect(fileKindOf('Dockerfile')).toBe('code')
  })

  it('shows anything else as text, which the viewer says plainly when it is not', () => {
    expect(fileKindOf('requirements.txt')).toBe('text')
    expect(fileKindOf('.gitignore')).toBe('text')
    expect(fileKindOf('LICENSE')).toBe('text')
    expect(fileKindOf('weights.bin')).toBe('text')
  })

  it('reads the extension of a name with a path, and none from a dot file', () => {
    expect(extensionOf('D:\\work\\a.b\\file.TXT')).toBe('txt')
    expect(extensionOf('.gitignore')).toBe('')
    expect(extensionOf('archive.tar.gz')).toBe('gz')
  })
})

describe('formatBytes', () => {
  it('gives the unit that fits', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(340 * 1024)).toBe('340 KB')
    expect(formatBytes(1.2 * 1024 ** 3)).toBe('1.2 GB')
  })
})

describe('joinPath', () => {
  it('uses the separator of the folder', () => {
    expect(joinPath('D:\\work\\app', 'src')).toBe('D:\\work\\app\\src')
    expect(joinPath('/home/a/app', 'src')).toBe('/home/a/app/src')
    expect(joinPath('/home/a/app/', 'src')).toBe('/home/a/app/src')
  })
})

describe('parseDelimited', () => {
  it('splits rows and cells', () => {
    expect(parseDelimited('a,b,c\n1,2,3\n', ',').rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('reads quoted cells with a comma, a doubled quote and a new line, and Windows line ends', () => {
    expect(parseDelimited('name,note\r\n"Doe, J.","said ""hi"""\r\n"two\nlines",x', ',').rows).toEqual([
      ['name', 'note'],
      ['Doe, J.', 'said "hi"'],
      ['two\nlines', 'x']
    ])
  })

  it('reads a tab-separated text and a last row with no new line', () => {
    expect(parseDelimited('a\tb\n1\t2', '\t').rows).toEqual([['a', 'b'], ['1', '2']])
  })

  it('stops at the number of rows asked and says so', () => {
    const text = Array.from({ length: 10 }, (_, i) => `r${i},x`).join('\n')
    const { rows, truncated } = parseDelimited(text, ',', 4)
    expect(rows).toHaveLength(4)
    expect(truncated).toBe(true)
    expect(parseDelimited('a,b\n', ',', 4).truncated).toBe(false)
  })
})
