import type { ReactNode } from 'react'
import { buildTokens, themeById, wallpaperCss, type ThemeSeed } from '@renderer/lib/themes'

/** A miniature of the app in a theme: sidebar, a message, a composer with its accent button, over the wallpaper if any. */
export function ThemePreview({ seed, height = 68 }: { seed: ThemeSeed; height?: number }) {
  const t = buildTokens(seed)
  return (
    <div
      className="flex w-full overflow-hidden rounded-md border"
      style={{
        height,
        background: seed.wallpaper ? wallpaperCss(seed, false) : t['--surface-root'],
        borderColor: t['--border-soft']
      }}
      aria-hidden="true"
    >
      <div className="w-[22%] shrink-0 space-y-1 p-1.5" style={{ background: t['--surface-sidebar'], borderRight: `1px solid ${t['--border-soft']}` }}>
        <div className="h-1 w-3/4 rounded-full" style={{ background: t['--text-muted'] }} />
        <div className="h-1 w-1/2 rounded-full" style={{ background: t['--border-strong'] }} />
        <div className="h-1 w-2/3 rounded-full" style={{ background: t['--border-strong'] }} />
      </div>
      <div className="flex flex-1 flex-col justify-between p-1.5" style={{ background: t['--surface-root'] }}>
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

function cardClass(selected: boolean): string {
  return [
    'group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors',
    selected ? 'border-[var(--text-primary)] bg-[var(--surface-muted)]' : 'border-[var(--border-soft)] hover:bg-[var(--surface-muted)]'
  ].join(' ')
}

function CardLabel({ label, selected, hint }: { label: string; selected: boolean; hint?: ReactNode }) {
  return (
    <span className="flex items-center justify-between gap-2 px-0.5 text-[12px] font-semibold text-[var(--text-primary)]">
      <span className="truncate">{label}</span>
      {hint}
      {selected && (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Selected">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      )}
    </span>
  )
}

export function ThemeCard({ seed, selected, onSelect }: { seed: ThemeSeed; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cardClass(selected)}>
      <ThemePreview seed={seed} />
      <CardLabel label={seed.label} selected={selected} />
    </button>
  )
}

/** Follows the operating system: half Seshat Light, half Seshat Dark. */
export function SystemCard({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const light = themeById('light')
  const dark = themeById('dark')
  if (!light || !dark) return null
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

export function ThemeGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{title}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3">{children}</div>
    </div>
  )
}

/** Compact segmented control used across the appearance page. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-[var(--border-soft)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={[
            'rounded-md px-3 py-1 text-[12px] font-semibold transition-colors',
            value === option.value ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
