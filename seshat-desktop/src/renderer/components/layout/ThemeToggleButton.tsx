import { useEffect, useState } from 'react'
import { Moon, SunOne } from '@icon-park/react'
import { Dropdown } from '@renderer/components/ui/Dropdown'
import { chooseTheme, getEffectiveTheme, getStoredTheme, MAIN_THEMES, type ThemePreference } from '@renderer/lib/theme'
import { themeById } from '@renderer/lib/themes'

/** A small round sample of a theme: its background, ringed with its accent. */
function Swatch({ id }: { id: ThemePreference }) {
  const seed = id === 'auto' ? undefined : themeById(id)
  return (
    <span
      className="size-3 rounded-full border"
      style={seed ? { background: seed.bg, borderColor: seed.accent } : { background: 'linear-gradient(135deg, #fbfcfd 50%, #14171d 50%)', borderColor: 'var(--border-strong)' }}
    />
  )
}

/** The button of the title bar: shows whether the appearance is light or dark, and offers Light, Night, Dark and the system's. */
export function ThemeToggleButton() {
  const [stored, setStored] = useState<ThemePreference>(() => getStoredTheme())
  const [scheme, setScheme] = useState(() => getEffectiveTheme())

  useEffect(() => {
    const sync = () => {
      setStored(getStoredTheme())
      setScheme(getEffectiveTheme())
    }
    window.addEventListener('seshat-theme-change', sync)
    return () => window.removeEventListener('seshat-theme-change', sync)
  }, [])

  return (
    <Dropdown
      label="Appearance"
      align="left"
      items={MAIN_THEMES.map((theme) => ({
        id: theme.id,
        label: theme.label,
        icon: <Swatch id={theme.id} />,
        checked: stored === theme.id,
        onSelect: () => chooseTheme(theme.id)
      }))}
      trigger={({ toggle }) => (
        <button
          type="button"
          className="flex size-7 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          onClick={toggle}
          aria-haspopup="menu"
          aria-label="Change the appearance"
          title="Appearance"
        >
          {scheme === 'dark' ? <Moon size={14} /> : <SunOne size={14} />}
        </button>
      )}
    />
  )
}
