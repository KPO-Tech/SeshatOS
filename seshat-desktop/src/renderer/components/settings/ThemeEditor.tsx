import { useRef, useState } from 'react'
import { isHexColor, paletteOf, readabilityWarning, seedFromPalette, type Palette } from '@renderer/lib/customThemes'
import { fileToWallpaperDataUrl } from '@renderer/lib/wallpaperImage'
import type { ThemeSeed, Wallpaper } from '@renderer/lib/themes'
import { Segmented } from './ThemeCards'

type Props = {
  theme: ThemeSeed
  /** Called with the edited theme: the caller stores it and applies it at once. */
  onChange: (theme: ThemeSeed) => void
  onDelete: () => void
}

const DEFAULT_GRADIENT = { kind: 'gradient', angle: 135, stops: ['#2b2370', '#0b4a5a'] } as const

/** Editing a custom theme: its name, three colours, and a wallpaper (none, a gradient, or a picture). */
export function ThemeEditor({ theme, onChange, onDelete }: Props) {
  const palette = paletteOf(theme)
  const warning = readabilityWarning(palette)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const wallpaperKind = theme.wallpaper?.kind ?? 'none'

  const withPalette = (patch: Partial<Palette>) => onChange(seedFromPalette(theme.id, theme.label, { ...palette, ...patch }, theme.wallpaper))
  const withWallpaper = (wallpaper: Wallpaper | undefined) => onChange(seedFromPalette(theme.id, theme.label, palette, wallpaper))

  function chooseKind(kind: 'none' | 'gradient' | 'image') {
    setError(null)
    if (kind === 'none') withWallpaper(undefined)
    else if (kind === 'gradient') withWallpaper(theme.wallpaper?.kind === 'gradient' ? theme.wallpaper : { ...DEFAULT_GRADIENT, stops: [...DEFAULT_GRADIENT.stops] })
    else if (theme.wallpaper?.kind === 'image') withWallpaper(theme.wallpaper)
    else fileRef.current?.click()
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      withWallpaper({ kind: 'image', dataUrl: await fileToWallpaperDataUrl(file), dim: theme.wallpaper?.kind === 'image' ? theme.wallpaper.dim : 0.45 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This picture could not be used.')
    }
  }

  const gradient = theme.wallpaper?.kind === 'gradient' ? theme.wallpaper : null
  const image = theme.wallpaper?.kind === 'image' ? theme.wallpaper : null

  return (
    <div className="grid gap-3 rounded-lg border border-[var(--border-soft)] p-4">
      <label className="grid gap-1">
        <span className="text-[12px] font-semibold text-[var(--text-secondary)]">Name</span>
        <input
          value={theme.label}
          maxLength={40}
          onChange={(event) => onChange({ ...theme, label: event.target.value || 'My theme' })}
          className="h-9 w-[260px] rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[13px] text-[var(--text-primary)]"
        />
      </label>

      <div>
        <div className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Palette</div>
        <div className="grid grid-cols-3 gap-4">
          <ColorField label="Surface" value={palette.surface} onChange={(surface) => withPalette({ surface })} />
          <ColorField label="Accent" value={palette.accent} onChange={(accent) => withPalette({ accent })} />
          <ColorField label="Text" value={palette.text} onChange={(text) => withPalette({ text })} />
        </div>
        {warning && <p className="mt-2 text-[12px] text-[var(--accent-warning)]">{warning}</p>}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">Wallpaper</div>
          <Segmented
            label="Wallpaper"
            value={wallpaperKind}
            options={[
              { value: 'none', label: 'None' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'image', label: 'Image' }
            ]}
            onChange={chooseKind}
          />
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void onFile(event.target.files?.[0]); event.target.value = '' }} />

        {gradient && (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-4">
              {gradient.stops.map((stop, index) => (
                <ColorField
                  key={index}
                  label={`Colour ${index + 1}`}
                  value={stop}
                  onChange={(value) => withWallpaper({ ...gradient, stops: gradient.stops.map((s, i) => (i === index ? value : s)) })}
                />
              ))}
              {gradient.stops.length < 4 && (
                <button type="button" className="self-end rounded-md px-2 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={() => withWallpaper({ ...gradient, stops: [...gradient.stops, gradient.stops[gradient.stops.length - 1]] })}>
                  + Colour
                </button>
              )}
              {gradient.stops.length > 2 && (
                <button type="button" className="self-end rounded-md px-2 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]" onClick={() => withWallpaper({ ...gradient, stops: gradient.stops.slice(0, -1) })}>
                  − Colour
                </button>
              )}
            </div>
            <Slider label="Angle" suffix="°" min={0} max={360} value={gradient.angle} onChange={(angle) => withWallpaper({ ...gradient, angle })} />
          </div>
        )}

        {image && (
          <div className="grid gap-3">
            <Slider label="Veil" suffix="%" min={0} max={80} value={Math.round(image.dim * 100)} onChange={(value) => withWallpaper({ ...image, dim: value / 100 })} />
            <button type="button" className="w-fit rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]" onClick={() => fileRef.current?.click()}>
              Choose another picture
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-[12px] text-[var(--accent-danger)]">{error}</p>}
        {wallpaperKind !== 'none' && (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">Panels become slightly translucent so the wallpaper shows through. Pick a surface close to the wallpaper to keep text readable.</p>
        )}
      </div>

      <div>
        <button type="button" onClick={onDelete} className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-[var(--accent-danger)] hover:bg-[var(--surface-muted)]">
          Delete this theme
        </button>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  // Follow the colour when it changes from outside (the picker, another field).
  if (shown !== value) {
    setShown(value)
    setText(value)
  }
  return (
    <div className="grid gap-1">
      <span className="text-[12px] font-semibold text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} colour`}
          className="size-9 cursor-pointer rounded-md border border-[var(--border-soft)] bg-transparent p-0.5"
        />
        <input
          value={text}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            if (isHexColor(next)) onChange(next.toLowerCase())
          }}
          aria-label={`${label} hex value`}
          className={[
            'h-9 w-[92px] rounded-md border bg-[var(--surface-panel)] px-2 font-mono text-[12px] text-[var(--text-primary)]',
            isHexColor(text) ? 'border-[var(--border-soft)]' : 'border-[var(--accent-danger)]'
          ].join(' ')}
        />
      </div>
    </div>
  )
}

function Slider({ label, suffix, min, max, value, onChange }: { label: string; suffix: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-[12px] font-semibold text-[var(--text-secondary)]">
      <span className="w-12">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-[260px] accent-[var(--accent-primary)]" />
      <span className="w-12 font-mono text-[var(--text-muted)]">{value}{suffix}</span>
    </label>
  )
}
