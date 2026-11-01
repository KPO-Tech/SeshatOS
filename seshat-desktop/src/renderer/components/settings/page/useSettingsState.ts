import { useEffect, useState } from 'react'
import { applyTheme, getStoredTheme, isThemePreference, notifyThemeChange, setStoredTheme, type ThemePreference } from '@renderer/lib/theme'

/** What the General and Appearance pages change: the theme and the language, kept in step with the rest of the app. */
export function useSettingsState() {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme())
  const [language, setLanguage] = useState(() => window.localStorage.getItem('seshat.language') || 'English')

  useEffect(() => {
    applyTheme(theme)
    setStoredTheme(theme)
    notifyThemeChange(theme)
  }, [theme])

  useEffect(() => {
    function onThemeChange(event: Event) {
      const next = (event as CustomEvent<{ theme?: ThemePreference }>).detail?.theme
      if (isThemePreference(next)) setTheme(next)
    }
    window.addEventListener('seshat-theme-change', onThemeChange)
    return () => window.removeEventListener('seshat-theme-change', onThemeChange)
  }, [])

  const updateLanguage = (next: string) => {
    setLanguage(next)
    window.localStorage.setItem('seshat.language', next)
  }

  return { theme, setTheme, language, updateLanguage }
}
