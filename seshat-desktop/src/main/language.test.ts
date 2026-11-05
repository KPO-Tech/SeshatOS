import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, Menu: {}, Notification: class {}, Tray: class {}, dialog: {}, nativeImage: {} }))

import { keepRunningMessage } from './background'
import { isMainLanguage, languageFromLocale, loadLanguage, mainT, saveLanguage, setMainLanguage } from './language'

afterEach(() => setMainLanguage('en'))

describe('the texts of the main process', () => {
  it('speaks English by default, and French once told', () => {
    expect(mainT('tray.quit')).toBe('Quit')
    setMainLanguage('fr')
    expect(mainT('tray.quit')).toBe('Quitter')
    expect(mainT('tray.open')).toBe('Ouvrir SeshatOS')
  })

  it('fills in the count, and says the notice of a hidden window in each language', () => {
    expect(keepRunningMessage(2).body).toMatch(/^2 tasks are still running/)
    setMainLanguage('fr')
    expect(keepRunningMessage(1).title).toBe('SeshatOS travaille encore')
    expect(keepRunningMessage(3).body).toMatch(/^3 tâches en cours/)
  })
})

describe('the language of the system', () => {
  it('maps a locale to a language the app has, and refuses the others', () => {
    expect(languageFromLocale('fr-FR')).toBe('fr')
    expect(languageFromLocale('en_US')).toBe('en')
    expect(languageFromLocale('de-DE')).toBeNull()
    expect(languageFromLocale(undefined)).toBeNull()
    expect(isMainLanguage('fr')).toBe(true)
    expect(isMainLanguage('klingon')).toBe(false)
  })
})

describe('the language kept for the next start', () => {
  const directories: string[] = []
  const fresh = () => {
    const directory = mkdtempSync(join(tmpdir(), 'seshat-language-'))
    directories.push(directory)
    return join(directory, 'nested', 'language.json')
  }
  afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

  it('is written and read back, in a folder that did not exist', () => {
    const path = fresh()
    saveLanguage(path, 'fr')
    expect(loadLanguage(path)).toBe('fr')
  })

  it('is null when there is no file, or the file holds something else', () => {
    const path = fresh()
    expect(loadLanguage(path)).toBeNull()
    saveLanguage(path, 'en')
    writeFileSync(path, '{"language":"xx"}')
    expect(loadLanguage(path)).toBeNull()
    writeFileSync(path, 'not json')
    expect(loadLanguage(path)).toBeNull()
  })
})
