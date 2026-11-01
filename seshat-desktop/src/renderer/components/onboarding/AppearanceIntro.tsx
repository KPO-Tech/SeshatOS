import { useEffect, useState } from 'react'
import { Platte } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { Titlebar } from '@renderer/components/layout/Titlebar'
import { ThemePreview } from '@renderer/components/settings/ThemeCards'
import { ACCENTS, chooseAccent, getStoredAccent } from '@renderer/lib/accent'
import { chooseTheme, getEffectiveTheme, getStoredTheme } from '@renderer/lib/theme'
import { themeById } from '@renderer/lib/themes'
import { AccentSwatches } from './AccentSwatches'
import { IntroBackdrop } from './IntroBackdrop'
import { IntroSteps } from './IntroSteps'

const CHOICES = [
  { id: 'dark', label: 'Dark', hint: 'The default theme' },
  { id: 'light', label: 'Light', hint: 'Clean and bright' },
  { id: 'midnight', label: 'Midnight', hint: 'A deep, vibrant theme' }
] as const

/** The theme the page shows as chosen: the one stored, or, while the app follows the system, the one of the same scheme. */
function shownTheme(stored: string): string {
  if (stored !== 'auto') return stored
  return getEffectiveTheme('auto') === 'light' ? 'light' : 'dark'
}

/**
 * The first screen of a new install: how the app looks, before anything else. A choice applies at once, so the page itself shows it, and
 * the same choices are in Settings > Appearance afterwards.
 */
export function AppearanceIntro({ onContinue }: { onContinue: () => void }) {
  const [theme, setTheme] = useState(() => getStoredTheme())
  const [accent, setAccent] = useState<string | null>(() => getStoredAccent())
  const shown = shownTheme(theme)
  // The accent that is on screen: the one chosen, or the one of the theme.
  const current = (accent ?? themeById(shown)?.accent ?? ACCENTS[0].hex).toLowerCase()

  useEffect(() => {
    const onEnter = (event: KeyboardEvent) => event.key === 'Enter' && onContinue()
    window.addEventListener('keydown', onEnter)
    return () => window.removeEventListener('keydown', onEnter)
  }, [onContinue])

  function pickTheme(id: string) {
    chooseTheme(id)
    setTheme(id)
  }

  function pickAccent(hex: string) {
    chooseAccent(hex)
    setAccent(hex)
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[var(--surface-root)] text-[var(--text-primary)]">
      <IntroBackdrop />
      <Titlebar bare center={null} />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-8 pt-1">
        <div className="flex flex-col items-center text-center">
          <SeshatLogo size={52} />
          <div className="text-[34px] font-semibold leading-tight tracking-[-0.01em]">
            Seshat<span className="text-[var(--accent-primary)]">OS</span>
          </div>
          <h1 className="m-0 mt-4 text-[30px] font-semibold leading-tight">Welcome to SeshatOS</h1>
          <p className="m-0 mt-2 text-[15px] text-[var(--text-secondary)]">An AI workspace for research, creation and automation.</p>
        </div>

        <div className="mt-5">
          <IntroSteps current={0} />
        </div>

        <section className="mt-6 w-full max-w-[950px] rounded-3xl border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-panel)_82%,transparent)] p-7 backdrop-blur-sm">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 text-[var(--accent-primary)]">
              <Platte theme="outline" size={30} />
            </span>
            <div>
              <h2 className="m-0 text-[20px] font-semibold">Choose your appearance</h2>
              <p className="m-0 mt-1 text-[14px] text-[var(--text-secondary)]">Pick a theme that suits you. You can change it later in Settings.</p>
            </div>
          </div>

          <div role="radiogroup" aria-label="Theme" className="mt-5 grid grid-cols-3 gap-6">
            {CHOICES.map((choice) => {
              const seed = themeById(choice.id)
              const selected = shown === choice.id
              return (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => pickTheme(choice.id)}
                  className="flex cursor-pointer flex-col items-center gap-3 border-0 bg-transparent p-0 text-center"
                >
                  <span className={`relative block w-full rounded-2xl p-1.5 transition-colors ${selected ? 'border-2 border-[var(--accent-primary)]' : 'border-2 border-transparent'}`}>
                    {seed && <ThemePreview seed={accent ? { ...seed, accent } : seed} height={104} />}
                    {selected && (
                      <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-[var(--accent-primary)] text-white">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m3.5 8.5 3 3 6-7" />
                        </svg>
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="block text-[16px] font-semibold">{choice.label}</span>
                    <span className="block text-[13px] text-[var(--text-muted)]">{choice.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-5 flex items-center gap-6 border-t border-[var(--border-soft)] pt-5">
            <span className="text-[16px] font-medium">Accent color</span>
            <AccentSwatches current={current} onPick={pickAccent} size={36} />
          </div>
        </section>

        <button
          type="button"
          onClick={onContinue}
          className="mt-6 flex h-[48px] cursor-pointer items-center gap-2.5 rounded-2xl border-0 bg-[var(--accent-primary)] px-9 text-[17px] font-semibold text-white shadow-[0_14px_34px_-14px_var(--accent-primary)] transition-[filter,transform] hover:brightness-110 active:scale-[0.99]"
        >
          Continue
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </main>
    </div>
  )
}
