import { useState } from 'react'
import {
  CONTENT_WIDTHS,
  DEFAULT_APPEARANCE,
  SPACINGS,
  TEXT_SIZES,
  ZOOMS,
  applyAppearance,
  getStoredAppearance,
  setStoredAppearance,
  type AppearancePrefs
} from '@renderer/lib/appearance'
import { THEMES, buildTokens, themeById, type ThemeSeed } from '@renderer/lib/themes'
import type { ThemePreference } from '@renderer/lib/theme'
import { Panel } from './SettingsPrimitives'

type Props = {
  theme: ThemePreference
  onThemeChange: (theme: ThemePreference) => void
}

const SESHAT_IDS = ['dark', 'light']

function group(predicate: (seed: ThemeSeed) => boolean): ThemeSeed[] {
  return THEMES.filter(predicate)
}

export function AppearanceSettings({ theme, onThemeChange }: Props) {
  const seshat = group((seed) => SESHAT_IDS.includes(seed.id))
  const dark = group((seed) => seed.scheme === 'dark' && !SESHAT_IDS.includes(seed.id))
  const light = group((seed) => seed.scheme === 'light' && !SESHAT_IDS.includes(seed.id))
  const current = theme === 'auto' ? 'System' : themeById(theme)?.label ?? 'Seshat Dark'
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => getStoredAppearance())
  const update = (patch: Partial<AppearancePrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    setStoredAppearance(next)
    applyAppearance(next)
  }
  const isDefault = JSON.stringify(prefs) === JSON.stringify(DEFAULT_APPEARANCE)

  return (
    <Panel title="Appearance">
      <div className="space-y-6">
        <section>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Theme</h2>
          <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
            Colours of the whole app, chat and code included. Current: <span className="font-semibold text-[var(--text-secondary)]">{current}</span>. The choice stays on this machine.
          </p>

          <div className="mt-4 grid gap-6">
            <ThemeGroup title="Seshat">
              <SystemCard selected={theme === 'auto'} onSelect={() => onThemeChange('auto')} />
              {seshat.map((seed) => (
                <ThemeCard key={seed.id} seed={seed} selected={theme === seed.id} onSelect={() => onThemeChange(seed.id)} />
              ))}
            </ThemeGroup>
            <ThemeGroup title="Dark">
              {dark.map((seed) => (
                <ThemeCard key={seed.id} seed={seed} selected={theme === seed.id} onSelect={() => onThemeChange(seed.id)} />
              ))}
            </ThemeGroup>
            <ThemeGroup title="Light">
              {light.map((seed) => (
                <ThemeCard key={seed.id} seed={seed} selected={theme === seed.id} onSelect={() => onThemeChange(seed.id)} />
              ))}
            </ThemeGroup>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Text and layout</h2>
            <button
              type="button"
              disabled={isDefault}
              onClick={() => update(DEFAULT_APPEARANCE)}
              className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Reset
            </button>
          </div>
          <div className="mt-4 grid gap-5">
            <Choice
              title="Chat text size"
              description="The size of the text of messages."
              value={prefs.textSize}
              options={TEXT_SIZES.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(textSize) => update({ textSize })}
            />
            <Choice
              title="Interface size"
              description="Zooms the whole window: menus, panels and text."
              value={String(prefs.zoom)}
              options={ZOOMS.map((z) => ({ value: String(z), label: `${z}%` }))}
              onChange={(zoom) => update({ zoom: Number(zoom) })}
            />
            <Choice
              title="Spacing"
              description="Room between messages and between list items."
              value={prefs.spacing}
              options={SPACINGS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(spacing) => update({ spacing })}
            />
            <Choice
              title="Conversation width"
              description="How wide messages and the composer can grow."
              value={prefs.contentWidth}
              options={CONTENT_WIDTHS.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(contentWidth) => update({ contentWidth })}
            />
          </div>
        </section>
      </div>
    </Panel>
  )
}

function Choice<T extends string>({
  title,
  description,
  value,
  options,
  onChange
}: {
  title: string
  description: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="text-[12px] text-[var(--text-muted)]">{description}</div>
      </div>
      <div role="radiogroup" aria-label={title} className="inline-flex rounded-lg border border-[var(--border-soft)] p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={[
              'rounded-md px-3 py-1 text-[12px] font-semibold transition-colors',
              value === option.value
                ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ThemeGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">{children}</div>
    </div>
  )
}

function cardClass(selected: boolean): string {
  return [
    'group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors',
    selected
      ? 'border-[var(--text-primary)] bg-[var(--surface-muted)]'
      : 'border-[var(--border-soft)] hover:bg-[var(--surface-muted)]'
  ].join(' ')
}

function ThemeCard({ seed, selected, onSelect }: { seed: ThemeSeed; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cardClass(selected)}>
      <ThemePreview seed={seed} />
      <CardLabel label={seed.label} selected={selected} />
    </button>
  )
}

/** Follows the operating system: half Seshat Light, half Seshat Dark. */
function SystemCard({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const light = themeById('light')!
  const dark = themeById('dark')!
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cardClass(selected)}>
      <div className="relative h-[68px] overflow-hidden rounded-md">
        <div className="absolute inset-0"><ThemePreview seed={light} /></div>
        <div className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}><ThemePreview seed={dark} /></div>
      </div>
      <CardLabel label="System" selected={selected} />
    </button>
  )
}

function CardLabel({ label, selected }: { label: string; selected: boolean }) {
  return (
    <span className="flex items-center justify-between gap-2 px-0.5 text-[12px] font-semibold text-[var(--text-primary)]">
      <span className="truncate">{label}</span>
      {selected && (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Selected">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      )}
    </span>
  )
}

/** A miniature of the app in this theme: sidebar, a message, an accent button. */
function ThemePreview({ seed }: { seed: ThemeSeed }) {
  const t = buildTokens(seed)
  return (
    <div className="flex h-[68px] w-full overflow-hidden rounded-md border" style={{ background: t['--surface-root'], borderColor: t['--border-soft'] }} aria-hidden="true">
      <div className="w-[22%] shrink-0 space-y-1 p-1.5" style={{ background: t['--surface-sidebar'], borderRight: `1px solid ${t['--border-soft']}` }}>
        <div className="h-1 w-3/4 rounded-full" style={{ background: t['--text-muted'] }} />
        <div className="h-1 w-1/2 rounded-full" style={{ background: t['--border-strong'] }} />
        <div className="h-1 w-2/3 rounded-full" style={{ background: t['--border-strong'] }} />
      </div>
      <div className="flex flex-1 flex-col justify-between p-1.5">
        <div className="space-y-1 rounded px-1.5 py-1" style={{ background: t['--surface-panel'] }}>
          <div className="h-1 w-5/6 rounded-full" style={{ background: t['--text-primary'] }} />
          <div className="h-1 w-3/5 rounded-full" style={{ background: t['--text-secondary'] }} />
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2.5 flex-1 rounded" style={{ background: t['--surface-muted'] }} />
          <div className="h-2.5 w-5 rounded" style={{ background: t['--accent-primary'] }} />
        </div>
      </div>
    </div>
  )
}
