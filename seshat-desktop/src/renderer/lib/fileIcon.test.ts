import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileIconName, folderIconName } from './fileIcon'
import { ICON_BY_EXTENSION, ICON_BY_FILE_NAME, ICON_BY_FOLDER_NAME } from './fileIconMap'

describe('the icon of a file', () => {
  it('goes by the exact name first', () => {
    expect(fileIconName('D:\\p\\go.mod')).toBe('go-mod')
    expect(fileIconName('/p/Makefile')).toBe('makefile')
    expect(fileIconName('tsconfig.node.json')).toBe('tsconfig')
    expect(fileIconName('vitest.config.ts')).toBe('vitest')
    expect(fileIconName('.gitignore')).toBe('git')
  })

  it('tries the longest extension before the last one', () => {
    expect(fileIconName('app.test.ts')).toBe('test-ts')
    expect(fileIconName('electron.d.ts')).toBe('typescript-def')
    expect(fileIconName('main.ts')).toBe('typescript')
    expect(fileIconName('Main.GO')).toBe('go')
  })

  it('falls back on the plain file icon', () => {
    expect(fileIconName('notes.zzz')).toBe('file')
    expect(fileIconName('noextension')).toBe('file')
    expect(fileIconName('trailingdot.')).toBe('file')
  })
})

describe('the icon of a folder', () => {
  it('goes by its name, open or closed', () => {
    expect(folderIconName('D:\\p\\src', false)).toBe('folder-src')
    expect(folderIconName('/p/src', true)).toBe('folder-src-open')
    expect(folderIconName('.GitHub', false)).toBe('folder-github')
  })

  it('falls back on the plain folder', () => {
    expect(folderIconName('whatever', false)).toBe('folder')
    expect(folderIconName('whatever', true)).toBe('folder-open')
  })
})

describe('the generated icons', () => {
  const dir = join(process.cwd(), 'src/renderer/assets/file-icons')

  it('has an SVG for every icon a map leads to, closed and open for folders', () => {
    const files = new Set([...Object.values(ICON_BY_EXTENSION), ...Object.values(ICON_BY_FILE_NAME), 'file', 'folder', 'folder-open'])
    for (const closed of Object.values(ICON_BY_FOLDER_NAME)) {
      files.add(closed)
      files.add(`${closed}-open`)
    }
    for (const name of files) expect(existsSync(join(dir, `${name}.svg`)), name).toBe(true)
  })
})
