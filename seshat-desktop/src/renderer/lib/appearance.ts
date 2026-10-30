// Size and spacing preferences, next to the colour theme (theme.ts): how big chat text is, how big the whole interface
// is, how much room there is between things, and how wide the conversation is. Each choice is a named step, never a
// free number, so what is stored is always something the layout was designed for.

export type TextSize = 'small' | 'default' | 'large' | 'xlarge'
export type Spacing = 'compact' | 'comfortable' | 'spacious'
export type ContentWidth = 'narrow' | 'default' | 'wide'

export type AppearancePrefs = {
  textSize: TextSize
  /** Zoom of the whole interface, in percent. */
  zoom: number
  spacing: Spacing
  contentWidth: ContentWidth
}

export const DEFAULT_APPEARANCE: AppearancePrefs = { textSize: 'default', zoom: 100, spacing: 'comfortable', contentWidth: 'default' }

export const TEXT_SIZES: ReadonlyArray<{ value: TextSize; label: string; px: number }> = [
  { value: 'small', label: 'Small', px: 12 },
  { value: 'default', label: 'Default', px: 14 },
  { value: 'large', label: 'Large', px: 16 },
  { value: 'xlarge', label: 'Extra large', px: 18 }
]

export const ZOOMS: readonly number[] = [90, 100, 110, 125, 150]

export const SPACINGS: ReadonlyArray<{ value: Spacing; label: string; messageGap: number; itemPadY: number }> = [
  { value: 'compact', label: 'Compact', messageGap: 20, itemPadY: 4 },
  { value: 'comfortable', label: 'Comfortable', messageGap: 36, itemPadY: 6 },
  { value: 'spacious', label: 'Spacious', messageGap: 48, itemPadY: 9 }
]

export const CONTENT_WIDTHS: ReadonlyArray<{ value: ContentWidth; label: string; px: number }> = [
  { value: 'narrow', label: 'Narrow', px: 780 },
  { value: 'default', label: 'Default', px: 900 },
  { value: 'wide', label: 'Wide', px: 1100 }
]

const storageKey = 'seshat.appearance'

/** Reads stored preferences, replacing anything unknown (an old version, a hand-edited value) by the default. */
export function parseAppearance(raw: unknown): AppearancePrefs {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const pick = <T extends string>(options: ReadonlyArray<{ value: T }>, candidate: unknown, fallback: T): T =>
    options.some((option) => option.value === candidate) ? (candidate as T) : fallback
  return {
    textSize: pick(TEXT_SIZES, value.textSize, DEFAULT_APPEARANCE.textSize),
    zoom: ZOOMS.includes(value.zoom as number) ? (value.zoom as number) : DEFAULT_APPEARANCE.zoom,
    spacing: pick(SPACINGS, value.spacing, DEFAULT_APPEARANCE.spacing),
    contentWidth: pick(CONTENT_WIDTHS, value.contentWidth, DEFAULT_APPEARANCE.contentWidth)
  }
}

/** The CSS variables the layout reads (defaults are in tailwind.css). */
export function appearanceVars(prefs: AppearancePrefs): Record<string, string> {
  const size = TEXT_SIZES.find((option) => option.value === prefs.textSize) ?? TEXT_SIZES[1]
  const spacing = SPACINGS.find((option) => option.value === prefs.spacing) ?? SPACINGS[1]
  const width = CONTENT_WIDTHS.find((option) => option.value === prefs.contentWidth) ?? CONTENT_WIDTHS[1]
  return {
    '--chat-font-size': `${size.px}px`,
    '--message-gap': `${spacing.messageGap}px`,
    '--list-item-pad-y': `${spacing.itemPadY}px`,
    '--chat-max-width': `${width.px}px`
  }
}

export function getStoredAppearance(): AppearancePrefs {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = window.localStorage.getItem(storageKey)
    return parseAppearance(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function setStoredAppearance(prefs: AppearancePrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(prefs))
  } catch {
    // Not remembered, still applied.
  }
}

export function applyAppearance(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const [name, value] of Object.entries(appearanceVars(prefs))) root.style.setProperty(name, value)
  // The zoom is the window's (Chromium scales layout and text together), so it goes through the main-process bridge
  // when there is one; in a plain browser (tests, the dev server) it is simply not applied.
  void window.seshat?.appearance?.setZoom(prefs.zoom / 100)
}
