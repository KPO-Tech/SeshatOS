import { loadCustomThemes, saveCustomThemes } from './customThemes'
import { allThemes, customThemesCss, isThemeId, presetsCss, setCustomThemes, themeById, type ColorScheme, type ThemeSeed } from './themes'

/** "auto" follows the operating system (Seshat Dark or Seshat Light); anything else is the id of a theme in themes.ts. */
export type ThemePreference = string
export type EffectiveTheme = ColorScheme

const themeStorageKey = 'seshat.theme'
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

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || isThemeId(value)
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'auto'
  ensureCustomThemes()
  try {
    const stored = window.localStorage.getItem(themeStorageKey)
    if (isThemePreference(stored)) return stored
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return 'auto'
}

export function setStoredTheme(theme: ThemePreference) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(themeStorageKey, theme)
  } catch {
    // Not remembered, still applied.
  }
}

function ensurePresetsStylesheet() {
  if (document.getElementById(presetsStyleId)) return
  const style = document.createElement('style')
  style.id = presetsStyleId
  style.textContent = presetsCss()
  document.head.appendChild(style)
}

function systemScheme(): ColorScheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Whether a theme is light or dark, which decides things a palette cannot (code highlighting, diagrams, the logo). */
function schemeOf(theme: ThemePreference): ColorScheme {
  if (theme === 'auto') return systemScheme()
  return themeById(theme)?.scheme ?? 'dark'
}

export function applyTheme(theme: ThemePreference) {
  if (typeof document === 'undefined') return
  ensureCustomThemes()
  ensurePresetsStylesheet()
  writeCustomStylesheet()
  const root = document.documentElement
  root.setAttribute('data-color-scheme', schemeOf(theme))
  if (theme === 'auto' || !isThemeId(theme)) {
    // tailwind.css picks Seshat Dark or Seshat Light from the system setting.
    root.removeAttribute('data-theme')
    return
  }
  root.dataset.theme = theme
}

export function getEffectiveTheme(theme: ThemePreference = getStoredTheme()): EffectiveTheme {
  return schemeOf(theme)
}

export function notifyThemeChange(theme: ThemePreference) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<{ theme: ThemePreference }>('seshat-theme-change', { detail: { theme } }))
}

/** Chooses a theme: remembered, applied, and told to everything that shows the current one. */
export function chooseTheme(theme: ThemePreference) {
  setStoredTheme(theme)
  applyTheme(theme)
  notifyThemeChange(theme)
}

/** The three appearances of Seshat, which the button of the title bar offers; "auto" follows the system and is the fourth. */
export const MAIN_THEMES: ReadonlyArray<{ id: ThemePreference; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'seshat-night', label: 'Night' },
  { id: 'dark', label: 'Dark' },
  { id: 'auto', label: 'System' }
]

/** Keeps data-color-scheme right while the theme is "auto" and the system setting changes. Returns the unsubscribe. */
export function followSystemScheme(): () => void {
  if (typeof window === 'undefined') return () => undefined
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getStoredTheme() === 'auto') applyTheme('auto')
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
