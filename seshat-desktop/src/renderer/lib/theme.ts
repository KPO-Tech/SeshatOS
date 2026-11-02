import { loadCustomThemes, saveCustomThemes } from './customThemes'
import { allThemes, customThemesCss, isThemeId, presetsCss, REPLACED, setCustomThemes, themeById, type ColorScheme, type ThemeSeed } from './themes'

// The appearance is two main themes, one dark and one light, and a mode that says which one shows: dark, light, or the one matching the
// operating system. The button of the title bar switches between the two; Settings > Appearance chooses what each of them is. Every theme
// of themes.ts can be either, by its scheme.

export type ThemeMode = 'dark' | 'light' | 'system'
export type MainThemes = Record<ColorScheme, string>
export type EffectiveTheme = ColorScheme

/** What a new install starts with: Seshat Dark and Shine. */
export const DEFAULT_MAIN_THEMES: MainThemes = { dark: 'dark', light: 'shine' }

const modeKey = 'seshat.theme.mode'
const mainKey: Record<ColorScheme, string> = { dark: 'seshat.theme.dark', light: 'seshat.theme.light' }
// Where the one theme chosen before 0.3.5 was kept: "auto" or a theme id. Read once, then moved to the keys above.
const legacyKey = 'seshat.theme'
const presetsStyleId = 'seshat-theme-presets'
const customStyleId = 'seshat-theme-custom'

let customLoaded = false

/** Reads the themes the person made, once, and makes them known before any stored choice is checked. */
function ensureCustomThemes() {
  if (customLoaded) return
  customLoaded = true
  setCustomThemes(loadCustomThemes())
}

function writeCustomStylesheet() {
  if (typeof document === 'undefined') return
  let style = document.getElementById(customStyleId)
  if (!style) {
    style = document.createElement('style')
    style.id = customStyleId
    document.head.appendChild(style)
  }
  style.textContent = customThemesCss(allThemes().filter((theme) => theme.category === 'custom'))
}

/** Stores the themes the person made, writes their CSS and returns false when they could not be stored. */
export function updateCustomThemes(list: readonly ThemeSeed[]): boolean {
  customLoaded = true
  const stored = saveCustomThemes(list)
  writeCustomStylesheet()
  return stored
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage can be blocked: not remembered, still applied.
  }
}

/** A theme id still offered: a preset taken out of the list is moved to the closest one kept. */
function current(id: string | null): string | null {
  if (!id) return null
  const kept = REPLACED[id] ?? id
  return isThemeId(kept) ? kept : null
}

/** Moves the single choice of earlier versions to the mode and the main theme of its scheme, once. */
function migrateLegacy() {
  const legacy = read(legacyKey)
  if (legacy === null) return
  write(legacyKey, null)
  if (read(modeKey) !== null) return
  if (legacy === 'auto') {
    write(modeKey, 'system')
    return
  }
  const id = current(legacy)
  const seed = id ? themeById(id) : undefined
  if (!seed) return
  write(mainKey[seed.scheme], seed.id)
  write(modeKey, seed.scheme)
}

function ensureLoaded() {
  if (typeof window === 'undefined') return
  ensureCustomThemes()
  migrateLegacy()
}

export function getThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  ensureLoaded()
  const mode = read(modeKey)
  return mode === 'dark' || mode === 'light' || mode === 'system' ? mode : 'dark'
}

/** The two main themes; one that is gone (a deleted theme of the person's, a preset taken out) falls back to its replacement or the default. */
export function getMainThemes(): MainThemes {
  if (typeof window === 'undefined') return { ...DEFAULT_MAIN_THEMES }
  ensureLoaded()
  const pick = (scheme: ColorScheme) => {
    const id = current(read(mainKey[scheme]))
    return id && themeById(id)?.scheme === scheme ? id : DEFAULT_MAIN_THEMES[scheme]
  }
  return { dark: pick('dark'), light: pick('light') }
}

function systemScheme(): ColorScheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Light or dark, as shown now. It decides what a palette cannot: code highlighting, diagrams, the logo, the icon of the title bar. */
export function getEffectiveTheme(): EffectiveTheme {
  const mode = getThemeMode()
  return mode === 'system' ? systemScheme() : mode
}

/** The id of the theme shown now. */
export function shownThemeId(): string {
  return getMainThemes()[getEffectiveTheme()]
}

function ensurePresetsStylesheet() {
  if (document.getElementById(presetsStyleId)) return
  const style = document.createElement('style')
  style.id = presetsStyleId
  style.textContent = presetsCss()
  document.head.appendChild(style)
}

/** Draws the theme the mode and the main themes say. */
export function applyCurrentTheme() {
  if (typeof document === 'undefined') return
  ensureLoaded()
  ensurePresetsStylesheet()
  writeCustomStylesheet()
  const id = shownThemeId()
  const root = document.documentElement
  root.setAttribute('data-color-scheme', themeById(id)?.scheme ?? 'dark')
  // Seshat Dark is the stylesheet's own default (tailwind.css); every other theme has its tokens under its id.
  root.dataset.theme = id
}

function notifyThemeChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('seshat-theme-change'))
}

function commit() {
  applyCurrentTheme()
  notifyThemeChange()
}

export function chooseMode(mode: ThemeMode) {
  write(modeKey, mode)
  commit()
}

/** The button of the title bar: from the theme shown to the main one of the other scheme. A system mode becomes the one switched to. */
export function toggleTheme() {
  chooseMode(getEffectiveTheme() === 'dark' ? 'light' : 'dark')
}

/**
 * Makes a theme the main one of its scheme and shows it. While the mode follows the system and the system is already on that scheme, the
 * mode stays "system"; otherwise it switches to the theme's scheme, so that the choice is seen.
 */
export function chooseTheme(id: string) {
  ensureLoaded()
  const seed = themeById(id)
  if (!seed) return
  write(mainKey[seed.scheme], seed.id)
  if (!(getThemeMode() === 'system' && systemScheme() === seed.scheme)) write(modeKey, seed.scheme)
  commit()
}

/** Keeps the theme right while the mode follows the system and the system setting changes. Returns the unsubscribe. */
export function followSystemScheme(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getThemeMode() === 'system') commit()
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Calls listener whenever the mode, a main theme or the system scheme the mode follows changes. Returns the unsubscribe. */
export function onThemeChange(listener: () => void): () => void {
  window.addEventListener('seshat-theme-change', listener)
  return () => window.removeEventListener('seshat-theme-change', listener)
}
