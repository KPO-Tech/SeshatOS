import { useEffect, useState } from 'react'
import { Moon, SunOne } from '@icon-park/react'
import { getEffectiveTheme, getMainThemes, onThemeChange, toggleTheme } from '@renderer/lib/theme'
import { themeById } from '@renderer/lib/themes'

/**
 * The button of the title bar: one click switches between the two main themes, the dark one and the light one (Seshat Dark and Shine
 * unless changed in Settings > Appearance). The icon shows the scheme on screen: a moon while dark, a sun while light.
 */
export function ThemeToggleButton() {
  const [scheme, setScheme] = useState(() => getEffectiveTheme())
  const [main, setMain] = useState(() => getMainThemes())

  useEffect(() => onThemeChange(() => {
    setScheme(getEffectiveTheme())
    setMain(getMainThemes())
  }), [])

  const next = scheme === 'dark' ? 'light' : 'dark'
  const label = `Switch to ${themeById(main[next])?.label ?? next}`
  return (
    <button
      type="button"
      className="flex size-7 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {scheme === 'dark' ? <Moon size={14} /> : <SunOne size={14} />}
    </button>
  )
}
