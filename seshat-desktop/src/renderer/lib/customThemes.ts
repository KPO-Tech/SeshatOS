// Themes the person makes: a name, three colours (surface, accent, text) and optionally a wallpaper. They are kept in
// this browser's storage, can be exported as a small JSON file and imported again, and never leave the machine.
//
// Everything read from storage or from a file is checked here before it reaches the stylesheet: colours must be six hex
// digits, a gradient is an angle and two to four colours (the CSS is built in themes.ts), a picture must be a small
// png, jpeg or webp data URL. Nothing is ever taken as CSS.

import { contrastRatio, mix, parseHex, setCustomThemes, type ThemeSeed, type Wallpaper } from './themes'

const storageKey = 'seshat.customThemes'
const FORMAT_VERSION = 1
const MAX_LABEL = 40
const MAX_THEMES = 40
/** About 1.1 MB of picture once encoded; the editor shrinks pictures well under this. */
const MAX_IMAGE_CHARS = 1_500_000

const HEX = /^#[0-9a-fA-F]{6}$/
const IMAGE_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/

export type Palette = { surface: string; accent: string; text: string }

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A surface darker than this is a dark theme: its text, borders and code colours are derived accordingly. */
export function schemeOfSurface(surface: string): 'light' | 'dark' {
  return luminance(surface) < 0.25 ? 'dark' : 'light'
}

export function seedFromPalette(id: string, label: string, palette: Palette, wallpaper?: Wallpaper): ThemeSeed {
  const scheme = schemeOfSurface(palette.surface)
  const seed: ThemeSeed = {
    id,
    label,
    category: 'custom',
    scheme,
    bg: palette.surface,
    // Raised surfaces: a touch toward the text on a dark surface, toward white on a light one.
    panel: scheme === 'dark' ? mix(palette.surface, palette.text, 0.07) : mix(palette.surface, '#ffffff', 0.55),
    text: palette.text,
    accent: palette.accent
  }
  if (wallpaper) seed.wallpaper = wallpaper
  return seed
}

export function paletteOf(seed: ThemeSeed): Palette {
  return { surface: seed.bg, accent: seed.accent, text: seed.text }
}

/** A sentence when the colours chosen are hard to read, or null. The editor shows it; it does not block saving. */
export function readabilityWarning(palette: Palette): string | null {
  if (contrastRatio(palette.text, palette.surface) < 4.5) return 'The text is hard to read on this surface. Pick colours that differ more.'
  if (contrastRatio('#ffffff', palette.accent) < 3) return 'The accent is too light for the white text of buttons. Pick a darker accent.'
  return null
}

export function parseWallpaper(raw: unknown): Wallpaper | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const w = raw as Record<string, unknown>
  if (w.kind === 'gradient') {
    const stops = Array.isArray(w.stops) ? w.stops : []
    if (typeof w.angle !== 'number' || !Number.isFinite(w.angle) || w.angle < 0 || w.angle > 360) return undefined
    if (stops.length < 2 || stops.length > 4 || !stops.every(isHexColor)) return undefined
    return { kind: 'gradient', angle: w.angle, stops: stops as string[] }
  }
  if (w.kind === 'image') {
    if (typeof w.dataUrl !== 'string' || w.dataUrl.length > MAX_IMAGE_CHARS || !IMAGE_URL.test(w.dataUrl)) return undefined
    const dim = typeof w.dim === 'number' && Number.isFinite(w.dim) ? Math.min(0.8, Math.max(0, w.dim)) : 0.45
    return { kind: 'image', dataUrl: w.dataUrl, dim }
  }
  return undefined
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const label = value.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL)
  return label.length > 0 ? label : null
}

/** A theme as stored or imported (id aside), or null when anything in it is not valid. */
export function parseCustomTheme(raw: unknown, id: string): ThemeSeed | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const label = cleanLabel(r.label)
  if (!label || !isHexColor(r.surface) || !isHexColor(r.accent) || !isHexColor(r.text)) return null
  const wallpaper = r.wallpaper === undefined ? undefined : parseWallpaper(r.wallpaper)
  if (r.wallpaper !== undefined && !wallpaper) return null
  return seedFromPalette(id, label, { surface: r.surface, accent: r.accent, text: r.text }, wallpaper)
}

export function newThemeId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function toStored(seed: ThemeSeed) {
  return { id: seed.id, label: seed.label, ...paletteOf(seed), wallpaper: seed.wallpaper }
}

export function loadCustomThemes(): ThemeSeed[] {
  if (typeof window === 'undefined') return []
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(raw)) return []
    const out: ThemeSeed[] = []
    for (const item of raw.slice(0, MAX_THEMES)) {
      const id = typeof item?.id === 'string' && /^custom-[a-z0-9]+$/.test(item.id) ? item.id : null
      const seed = id ? parseCustomTheme(item, id) : null
      if (seed) out.push(seed)
    }
    return out
  } catch {
    return []
  }
}

/** Remembers the themes and makes them known to the registry. Returns false when the browser refused to store them. */
export function saveCustomThemes(list: readonly ThemeSeed[]): boolean {
  setCustomThemes(list)
  if (typeof window === 'undefined') return true
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(list.map(toStored)))
    return true
  } catch {
    return false
  }
}

/** A new custom theme with the colours (and wallpaper) of an existing one. */
export function duplicateTheme(source: ThemeSeed, label: string): ThemeSeed {
  return seedFromPalette(newThemeId(), cleanLabel(label) ?? 'My theme', paletteOf(source), source.wallpaper)
}

/**
 * The file format of an exported theme. A gradient travels with it; a picture does not (it can be megabytes), so an
 * imported theme with a picture starts without one.
 */
export function exportTheme(seed: ThemeSeed): string {
  const gradient = seed.wallpaper?.kind === 'gradient' ? seed.wallpaper : undefined
  return JSON.stringify({ seshatTheme: FORMAT_VERSION, label: seed.label, ...paletteOf(seed), ...(gradient ? { wallpaper: gradient } : {}) }, null, 2)
}

/** Reads an exported theme. Throws an Error whose message can be shown as it is. */
export function importTheme(text: string): ThemeSeed {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This is not a theme file: the JSON could not be read.')
  }
  if (typeof raw !== 'object' || raw === null || (raw as Record<string, unknown>).seshatTheme !== FORMAT_VERSION) {
    throw new Error('This is not a Seshat theme file (or it comes from a newer version).')
  }
  const seed = parseCustomTheme(raw, newThemeId())
  if (!seed) throw new Error('The theme is incomplete or has a colour that is not written as #rrggbb.')
  return seed
}
