import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// lib/theme.ts reads localStorage and the system scheme from window, and keeps module state: each test gets a fresh window and module.
let storage: Map<string, string>
let systemDark: boolean

async function load() {
  vi.resetModules()
  return import('./theme')
}

beforeEach(() => {
  storage = new Map()
  systemDark = true
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key)
    },
    matchMedia: () => ({ matches: systemDark, addEventListener: () => undefined, removeEventListener: () => undefined }),
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('main themes', () => {
  it('starts with Seshat Dark and Shine, dark', async () => {
    const theme = await load()
    expect(theme.getMainThemes()).toEqual({ dark: 'dark', light: 'shine' })
    expect(theme.getThemeMode()).toBe('dark')
    expect(theme.shownThemeId()).toBe('dark')
  })

  it('switches between the two from the button', async () => {
    const theme = await load()
    theme.toggleTheme()
    expect(theme.shownThemeId()).toBe('shine')
    expect(theme.getEffectiveTheme()).toBe('light')
    theme.toggleTheme()
    expect(theme.shownThemeId()).toBe('dark')
  })

  it('makes a picked theme the main one of its scheme and shows it', async () => {
    const theme = await load()
    theme.chooseTheme('carbon')
    theme.chooseTheme('paper')
    expect(theme.getMainThemes()).toEqual({ dark: 'carbon', light: 'paper' })
    expect(theme.shownThemeId()).toBe('paper')
    theme.toggleTheme()
    expect(theme.shownThemeId()).toBe('carbon')
  })

  it('follows the system, and stays on it when the theme picked matches the system', async () => {
    const theme = await load()
    theme.chooseMode('system')
    expect(theme.shownThemeId()).toBe('dark')
    systemDark = false
    expect(theme.shownThemeId()).toBe('shine')
    theme.chooseTheme('alpine')
    expect(theme.getThemeMode()).toBe('system')
    theme.chooseTheme('dusk')
    expect(theme.getThemeMode()).toBe('dark')
  })

  it('falls back to the default when a stored main theme is gone or of the other scheme', async () => {
    storage.set('seshat.theme.dark', 'shine')
    storage.set('seshat.theme.light', 'custom-deleted')
    storage.set('seshat.theme.mode', 'dark')
    const theme = await load()
    expect(theme.getMainThemes()).toEqual({ dark: 'dark', light: 'shine' })
  })
})

describe('the choice of earlier versions', () => {
  it('moves a theme to the main one of its scheme, a removed preset to its replacement', async () => {
    storage.set('seshat.theme', 'kanagawa')
    const theme = await load()
    expect(theme.getMainThemes()).toEqual({ dark: 'mirage', light: 'shine' })
    expect(theme.getThemeMode()).toBe('dark')
    expect(storage.has('seshat.theme')).toBe(false)
  })

  it('keeps a light one light', async () => {
    storage.set('seshat.theme', 'shine')
    const theme = await load()
    expect(theme.getThemeMode()).toBe('light')
    expect(theme.shownThemeId()).toBe('shine')
  })

  it('turns "auto" into the system mode', async () => {
    storage.set('seshat.theme', 'auto')
    const theme = await load()
    expect(theme.getThemeMode()).toBe('system')
  })
})
