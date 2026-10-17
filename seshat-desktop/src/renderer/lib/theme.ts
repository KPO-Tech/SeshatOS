import { isThemeId, presetsCss, themeById, type ColorScheme } from './themes'

/** "auto" follows the operating system (Seshat Dark or Seshat Light); anything else is the id of a theme in themes.ts. */
export type ThemePreference = string
export type EffectiveTheme = ColorScheme

const themeStorageKey = 'seshat.theme'
const presetsStyleId = 'seshat-theme-presets'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || isThemeId(value)
}

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'auto'
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
export function schemeOf(theme: ThemePreference): ColorScheme {
  if (theme === 'auto') return systemScheme()
  return themeById(theme)?.scheme ?? 'dark'
}

export function applyTheme(theme: ThemePreference) {
  if (typeof document === 'undefined') return
  ensurePresetsStylesheet()
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

/** The quick toggle of the sidebar: from a dark theme to Seshat Light, from a light one to Seshat Dark. */
export function toggleStoredTheme(): ThemePreference {
  const nextTheme: ThemePreference = getEffectiveTheme() === 'dark' ? 'light' : 'dark'
  setStoredTheme(nextTheme)
  applyTheme(nextTheme)
  notifyThemeChange(nextTheme)
  return nextTheme
}

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
