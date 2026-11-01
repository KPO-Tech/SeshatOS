// The appearances the desktop offers, and the design tokens each one sets.
//
// A theme is a small seed (background, raised surface, text, accent, and whether it is light or dark); every token the
// interface reads (see tailwind.css) is derived from it, so a new theme is one line and the derived tokens keep their
// contrast. "dark" and "light" are Seshat's own identity (warm surfaces, orange accent) and are defined in
// tailwind.css; the others are presets in the spirit of Freebuff Desktop's list of appearance names (Apache-2.0,
// common/src/constants/freebuff-desktop-appearance.ts). Only the names and the idea come from there: the colours are
// ours. Nothing about the chosen appearance leaves the machine.

export type ColorScheme = 'light' | 'dark'

type ThemeCategory = 'seshat' | 'dark' | 'light' | 'gradient' | 'custom'

/** A gradient behind the whole window: an angle and two to four colours. Built into CSS here, never taken as CSS from outside. */
type GradientWallpaper = { kind: 'gradient'; angle: number; stops: string[] }
/** A picture behind the whole window, as a data URL, dimmed by `dim` (0 to 0.8) so the interface stays readable. */
type ImageWallpaper = { kind: 'image'; dataUrl: string; dim: number }
export type Wallpaper = GradientWallpaper | ImageWallpaper

export type ThemeSeed = {
  id: string
  label: string
  category?: ThemeCategory
  /** Behind the window. When there is one, the surfaces are translucent so it shows through. */
  wallpaper?: Wallpaper
  scheme: ColorScheme
  /** Window background. */
  bg: string
  /** Raised surfaces: cards, inputs, menus. */
  panel: string
  text: string
  accent: string
}

type ThemeTokens = Record<`--${string}`, string>

// Seshat's own two appearances. Their tokens live in tailwind.css, so they are listed here for the picker only.
const SESHAT: ThemeSeed[] = [
  { id: 'dark', label: 'Seshat Dark', scheme: 'dark', bg: '#2f2e34', panel: '#3a3941', text: '#e7e2da', accent: '#ef7c2f' },
  { id: 'light', label: 'Seshat Light', scheme: 'light', bg: '#fbfcfd', panel: '#ffffff', text: '#0c182e', accent: '#ef7c2f' }
]

const PRESETS: ThemeSeed[] = [
  // Seshat's third appearance: the blue-black night of the Projects design (measured on it), with the orange of Seshat Dark, brighter.
  { id: 'seshat-night', label: 'Seshat Night', category: 'seshat', scheme: 'dark', bg: '#14171d', panel: '#1b1f26', text: '#e8eaee', accent: '#e26d1f' },
  // Dark
  { id: 'carbon', label: 'Carbon', scheme: 'dark', bg: '#0c0c0d', panel: '#161617', text: '#e4e4e6', accent: '#d9622a' },
  { id: 'graphite', label: 'Graphite', category: 'gradient', scheme: 'dark', bg: '#1b1d24', panel: '#262933', text: '#e6e7e9', accent: '#5b86b8', wallpaper: { kind: 'gradient', angle: 140, stops: ['#3a3f55', '#23262f', '#15161b'] } },
  { id: 'midnight', label: 'Midnight', category: 'gradient', scheme: 'dark', bg: '#0e1226', panel: '#171d3a', text: '#dde5f2', accent: '#4f7fe0', wallpaper: { kind: 'gradient', angle: 135, stops: ['#2b2370', '#14224a', '#0b4a5a'] } },
  { id: 'orbit', label: 'Orbit', scheme: 'dark', bg: '#15172b', panel: '#1e2140', text: '#dfe1f5', accent: '#6c7bf0' },
  { id: 'tide', label: 'Tide', scheme: 'dark', bg: '#14232b', panel: '#1b303a', text: '#dbe9ee', accent: '#2a93b5' },
  { id: 'after-rain', label: 'After rain', scheme: 'dark', bg: '#1b2420', panel: '#25322c', text: '#dde8e0', accent: '#3f9568' },
  { id: 'aurora', label: 'Aurora', scheme: 'dark', bg: '#0f2027', panel: '#17313a', text: '#d9f1ee', accent: '#1f9d86' },
  { id: 'phosphor', label: 'Phosphor', scheme: 'dark', bg: '#0b130d', panel: '#132017', text: '#bdf5c8', accent: '#2a9a49' },
  { id: 'kanagawa', label: 'Kanagawa', scheme: 'dark', bg: '#1f1f28', panel: '#2a2a37', text: '#dcd7ba', accent: '#6d86c9' },
  { id: 'mirage', label: 'Mirage', scheme: 'dark', bg: '#1f2430', panel: '#2a3040', text: '#d9dce4', accent: '#c7762a' },
  { id: 'violet-hour', label: 'Violet hour', scheme: 'dark', bg: '#1f1a2e', panel: '#2b2440', text: '#e8e1f5', accent: '#9b6dff' },
  { id: 'nebula', label: 'Nebula', scheme: 'dark', bg: '#1a1426', panel: '#261c38', text: '#eadff5', accent: '#d04fa6' },
  { id: 'dusk', label: 'Dusk', category: 'gradient', scheme: 'dark', bg: '#251a28', panel: '#352636', text: '#ecdfe3', accent: '#d9684a', wallpaper: { kind: 'gradient', angle: 160, stops: ['#7d3552', '#3a1c3a', '#231424'] } },
  { id: 'ember', label: 'Ember', scheme: 'dark', bg: '#261a17', panel: '#34231f', text: '#f0e0d6', accent: '#e5582d' },
  // Light
  { id: 'shine', label: 'Shine', scheme: 'light', bg: '#fbfaf6', panel: '#ffffff', text: '#1a1a1a', accent: '#d17a22' },
  { id: 'paper', label: 'Paper', scheme: 'light', bg: '#f6f3ec', panel: '#fffefb', text: '#25221d', accent: '#8a5a2b' },
  { id: 'alpine', label: 'Alpine', scheme: 'light', bg: '#f2f6f9', panel: '#ffffff', text: '#14232d', accent: '#2b7bb9' },
  { id: 'frost', label: 'Frost', scheme: 'light', bg: '#eef4f8', panel: '#fafdff', text: '#17303f', accent: '#3b8fc4' },
  { id: 'dune', label: 'Dune', scheme: 'light', bg: '#f5eddf', panel: '#fbf6ec', text: '#3a2f22', accent: '#b8742e' },
  { id: 'daybreak', label: 'Daybreak', category: 'gradient', scheme: 'light', bg: '#fdf3e0', panel: '#fffdf6', text: '#2f2a1b', accent: '#a36b05', wallpaper: { kind: 'gradient', angle: 150, stops: ['#ffe4bd', '#f3e8ff', '#c7dcf8'] } },
  { id: 'peach', label: 'Peach', category: 'gradient', scheme: 'light', bg: '#fdeee6', panel: '#fff8f3', text: '#3d2a1f', accent: '#d1531c', wallpaper: { kind: 'gradient', angle: 135, stops: ['#ffdccd', '#ffe9d9', '#ffd8e0'] } },
  { id: 'sherbet', label: 'Sherbet', category: 'gradient', scheme: 'light', bg: '#ffeef0', panel: '#fff8f9', text: '#3a2420', accent: '#d8466f', wallpaper: { kind: 'gradient', angle: 140, stops: ['#ffd2de', '#ffe6d0', '#f6c8e6'] } },
  { id: 'blossom', label: 'Blossom', scheme: 'light', bg: '#fbf1f3', panel: '#fffafb', text: '#3a2330', accent: '#c94f7c' },
  { id: 'lilac', label: 'Lilac', category: 'gradient', scheme: 'light', bg: '#f1ecfb', panel: '#fbf9fe', text: '#2a2140', accent: '#7d5bd0', wallpaper: { kind: 'gradient', angle: 135, stops: ['#d8d0ff', '#e9dcff', '#ffd8f0'] } },
  { id: 'seafoam', label: 'Seafoam', category: 'gradient', scheme: 'light', bg: '#e9f6f0', panel: '#f9fdfb', text: '#14302a', accent: '#1f8a73', wallpaper: { kind: 'gradient', angle: 135, stops: ['#c3f0e2', '#e2f6ee', '#d2e9ff'] } }
]

function withCategory(seed: ThemeSeed, fallback: ThemeCategory): ThemeSeed {
  return seed.category ? seed : { ...seed, category: fallback }
}

export const THEMES: readonly ThemeSeed[] = [
  ...SESHAT.map((seed) => withCategory(seed, 'seshat')),
  ...PRESETS.map((seed) => withCategory(seed, seed.scheme === 'dark' ? 'dark' : 'light'))
]

// Themes the person made (lib/customThemes.ts keeps them and calls setCustomThemes). They behave like presets everywhere.
let customThemes: readonly ThemeSeed[] = []

export function setCustomThemes(list: readonly ThemeSeed[]) {
  customThemes = list
}

export function allThemes(): readonly ThemeSeed[] {
  return [...THEMES, ...customThemes]
}

/** The ids a person can pick, as stored. "auto" follows the operating system and is not a theme of its own. */
type ThemeId = (typeof THEMES)[number]['id']

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && allThemes().some((theme) => theme.id === value)
}

export function themeById(id: string): ThemeSeed | undefined {
  return allThemes().find((theme) => theme.id === id)
}

// ── Colour arithmetic ─────────────────────────────────────────────────────────

type Rgb = [number, number, number]

export function parseHex(hex: string): Rgb {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb
}

function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

/** `amount` of `b` mixed into `a` (0 gives a, 1 gives b). */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  return toHex([ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount])
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ── Tokens ────────────────────────────────────────────────────────────────────

const STATUS: Record<ColorScheme, { success: string; warning: string; danger: string; info: string }> = {
  dark: { success: '#6faf7b', warning: '#d6a15f', danger: '#c96b5c', info: '#7d9ccf' },
  light: { success: '#41b883', warning: '#d99a25', danger: '#e05252', info: '#6485b8' }
}

// ── Code colours ──────────────────────────────────────────────────────────────

// The base syntax palettes (in the spirit of VS Code's Dark+ and Light+), pulled a little toward each theme's accent so
// code looks at home in it, then pushed toward the text colour until it reads on the code background.
const SYNTAX: Record<ColorScheme, Record<'keyword' | 'string' | 'number' | 'function' | 'type' | 'variable' | 'tag', string>> = {
  dark: { keyword: '#c586c0', string: '#ce9178', number: '#b5cea8', function: '#dcdcaa', type: '#4ec9b0', variable: '#9cdcfe', tag: '#569cd6' },
  light: { keyword: '#af00db', string: '#a31515', number: '#098658', function: '#795e26', type: '#267f99', variable: '#001080', tag: '#800000' }
}

export const CODE_MIN_CONTRAST = 4.5

/** Mixes `color` toward `toward` until it reaches `minRatio` against `bg` (or `toward` itself is all that is left). */
export function ensureContrast(color: string, bg: string, toward: string, minRatio: number): string {
  let out = color
  for (let step = 1; step <= 10 && contrastRatio(out, bg) < minRatio; step++) out = mix(color, toward, step / 10)
  return out
}

/** The code background of a theme: a little darker than a dark window, a faint tint on a light one. */
function codeBackground(seed: ThemeSeed): string {
  return seed.scheme === 'dark' ? mix(seed.bg, '#000000', 0.16) : mix(seed.bg, seed.text, 0.05)
}

export function codeTokens(seed: ThemeSeed): ThemeTokens {
  const bg = codeBackground(seed)
  const base = SYNTAX[seed.scheme]
  const tone = (color: string, flavour = 0.18) => ensureContrast(mix(color, seed.accent, flavour), bg, seed.text, CODE_MIN_CONTRAST)
  return {
    '--code-bg': bg,
    '--code-fg': ensureContrast(seed.text, bg, seed.text, CODE_MIN_CONTRAST),
    '--code-comment': ensureContrast(mix(seed.text, seed.bg, 0.46), bg, seed.text, 3.2),
    '--code-punctuation': ensureContrast(mix(seed.text, seed.bg, 0.2), bg, seed.text, CODE_MIN_CONTRAST),
    '--code-keyword': tone(base.keyword, 0.3),
    '--code-string': tone(base.string),
    '--code-number': tone(base.number),
    '--code-function': tone(base.function),
    '--code-type': tone(base.type),
    '--code-variable': tone(base.variable),
    '--code-tag': tone(base.tag)
  }
}

function rgbTriplet(hex: string): string {
  return parseHex(hex).join(', ')
}

/** Every token the interface reads, derived from the seed. */
/** How opaque each surface stays when a wallpaper is behind it: the window lets the most through, raised panels the least. */
const WALLPAPER_ALPHA = { root: 0.72, sidebar: 0.8, panel: 0.86, muted: 0.9 } as const

/** The CSS `background` of a wallpaper, built from checked values only. `fixed` keeps it still behind scrolling content (the window); a small preview wants it off. */
export function wallpaperCss(seed: ThemeSeed, fixed = true): string {
  const attach = fixed ? ' fixed' : ''
  const w = seed.wallpaper
  if (!w) return ''
  if (w.kind === 'gradient') {
    const stops = w.stops.map((stop) => parseHex(stop)).map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`).join(', ')
    return `linear-gradient(${Math.round(w.angle)}deg, ${stops}) center / cover${attach}`
  }
  const veil = rgba(seed.bg, Math.min(0.8, Math.max(0, w.dim)))
  return `linear-gradient(${veil}, ${veil}), url("${w.dataUrl}") center / cover${attach}`
}

/**
 * The opaque colours the surfaces of a theme end up showing: its own when it has no wallpaper, and one set per wallpaper
 * colour when it has (a gradient stop, or the middle grey of a picture under its veil). What readability is judged on.
 */
export function effectiveSurfaces(seed: ThemeSeed): Array<{ root: string; panel: string; muted: string }> {
  const muted = mix(seed.panel, seed.text, 0.08)
  const w = seed.wallpaper
  if (!w) return [{ root: seed.bg, panel: seed.panel, muted }]
  const behind = w.kind === 'gradient' ? w.stops : [mix('#808080', seed.bg, Math.min(0.8, Math.max(0, w.dim)))]
  return behind.map((stop) => ({
    root: mix(stop, seed.bg, WALLPAPER_ALPHA.root),
    panel: mix(stop, seed.panel, WALLPAPER_ALPHA.panel),
    muted: mix(stop, muted, WALLPAPER_ALPHA.muted)
  }))
}

export function buildTokens(seed: ThemeSeed): ThemeTokens {
  const dark = seed.scheme === 'dark'
  const status = STATUS[seed.scheme]
  const sidebar = dark ? mix(seed.bg, '#000000', 0.14) : mix(seed.bg, seed.text, 0.04)
  const muted = mix(seed.panel, seed.text, 0.08)
  const over = seed.wallpaper !== undefined
  return {
    // Set only when there is a wallpaper: the body falls back to --surface-root without one (see tailwind.css).
    ...(over ? { '--wallpaper': wallpaperCss(seed) } : {}),
    '--surface-root': over ? rgba(seed.bg, WALLPAPER_ALPHA.root) : seed.bg,
    '--surface-sidebar': over ? rgba(sidebar, WALLPAPER_ALPHA.sidebar) : sidebar,
    '--surface-panel': over ? rgba(seed.panel, WALLPAPER_ALPHA.panel) : seed.panel,
    '--surface-muted': over ? rgba(muted, WALLPAPER_ALPHA.muted) : muted,
    '--border-soft': mix(seed.bg, seed.text, 0.14),
    '--border-strong': mix(seed.bg, seed.text, 0.22),
    '--text-primary': seed.text,
    '--text-secondary': mix(seed.text, seed.bg, 0.28),
    '--text-muted': mix(seed.text, seed.bg, 0.46),
    '--accent-primary': seed.accent,
    '--accent-success': status.success,
    '--accent-warning': status.warning,
    '--accent-danger': status.danger,
    '--accent-info': status.info,
    '--surface-hover': rgba(seed.text, 0.05),
    '--surface-menu': rgba(seed.panel, 0.98),
    '--accent-subtle': rgba(seed.accent, 0.12),
    '--color-success-rgb': rgbTriplet(status.success),
    '--color-error-rgb': rgbTriplet(status.danger),
    '--color-info-rgb': rgbTriplet(status.info),
    ...codeTokens(seed)
  }
}

function block(selector: string, tokens: ThemeTokens): string {
  const body = Object.entries(tokens).map(([name, value]) => `  ${name}: ${value};`).join('\n')
  return `${selector} {\n${body}\n}`
}

/** The CSS of the themes the person made. */
export function customThemesCss(list: readonly ThemeSeed[]): string {
  return list.map((seed) => block(`:root[data-theme="${seed.id}"]`, buildTokens(seed))).join('\n')
}

/**
 * The CSS of every preset (all their tokens), and the code colours of Seshat's own two themes (their other tokens are
 * in tailwind.css). Seshat Dark is the default; Seshat Light applies on its own id and, with no theme chosen, when the
 * system is light.
 */
export function presetsCss(): string {
  const [dark, light] = SESHAT
  return [
    block(':root', codeTokens(dark)),
    block(':root[data-theme="light"]', codeTokens(light)),
    `@media (prefers-color-scheme: light) {\n${block(':root:not([data-theme])', codeTokens(light))}\n}`,
    ...PRESETS.map((seed) => block(`:root[data-theme="${seed.id}"]`, buildTokens(seed)))
  ].join('\n')
}
