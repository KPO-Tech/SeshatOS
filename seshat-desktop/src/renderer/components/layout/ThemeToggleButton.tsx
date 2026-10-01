import { useEffect, useState } from 'react'
import { Moon, SunOne } from '@icon-park/react'
import { getEffectiveTheme, toggleStoredTheme, type EffectiveTheme } from '@renderer/lib/theme'

export function ThemeToggleButton() {
  const [theme, setTheme] = useState<EffectiveTheme>(() => getEffectiveTheme())

  useEffect(() => {
    const sync = () => setTheme(getEffectiveTheme())
    window.addEventListener('seshat-theme-change', sync)
    return () => window.removeEventListener('seshat-theme-change', sync)
  }, [])

  return (
    <button
      type="button"
      className="flex size-7 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
      onClick={() => toggleStoredTheme()}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <SunOne size={14} /> : <Moon size={14} />}
    </button>
  )
}
