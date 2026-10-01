export type ThemePreference = 'light' | 'dark' | 'auto'
export type EffectiveTheme = 'light' | 'dark'

const themeStorageKey = 'seshat.theme'

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'auto'
  const stored = window.localStorage.getItem(themeStorageKey)
  if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  return 'auto'
}

export function setStoredTheme(theme: ThemePreference) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(themeStorageKey, theme)
}

export function applyTheme(theme: ThemePreference) {
  if (typeof document === 'undefined') return
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme')
    return
  }
  document.documentElement.dataset.theme = theme
}

export function getEffectiveTheme(theme: ThemePreference = getStoredTheme()): EffectiveTheme {
  if (theme !== 'auto') return theme
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function notifyThemeChange(theme: ThemePreference) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<{ theme: ThemePreference }>('seshat-theme-change', { detail: { theme } }))
}

export function toggleStoredTheme(): ThemePreference {
  const nextTheme: ThemePreference = getEffectiveTheme() === 'dark' ? 'light' : 'dark'
  setStoredTheme(nextTheme)
  applyTheme(nextTheme)
  notifyThemeChange(nextTheme)
  return nextTheme
}
