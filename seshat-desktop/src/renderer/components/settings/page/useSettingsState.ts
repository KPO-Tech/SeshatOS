import { useState } from 'react'

/** What the Language & notifications page changes: the language. The appearance keeps its own state in lib/theme.ts. */
export function useSettingsState() {
  const [language, setLanguage] = useState(() => window.localStorage.getItem('seshat.language') || 'English')

  const updateLanguage = (next: string) => {
    setLanguage(next)
    window.localStorage.setItem('seshat.language', next)
  }

  return { language, updateLanguage }
}
