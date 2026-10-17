// The appearances the desktop offers, and the design tokens each one sets.
//
// A theme is a small seed (background, raised surface, text, accent, and whether it is light or dark); every token the
// interface reads (see tailwind.css) is derived from it, so a new theme is one line and the derived tokens keep their
// contrast. "dark" and "light" are Seshat's own identity (warm surfaces, orange accent) and are defined in
// tailwind.css; the others are presets in the spirit of Freebuff Desktop's list of appearance names (Apache-2.0,
// common/src/constants/freebuff-desktop-appearance.ts). Only the names and the idea come from there: the colours are
// ours. Nothing about the chosen appearance leaves the machine.

export type ColorScheme = 'light' | 'dark'

export type ThemeSeed = {
  id: string
  label: string
  scheme: ColorScheme
  /** Window background. */
  bg: string
  /** Raised surfaces: cards, inputs, menus. */
  panel: string
  text: string
  accent: string
}

export type ThemeTokens = Record<`--${string}`, string>

// Seshat's own two appearances. Their tokens live in tailwind.css, so they are listed here for the picker only.
const SESHAT: ThemeSeed[] = [
  { id: 'dark', label: 'Seshat Dark', scheme: 'dark', bg: '#2f2e34', panel: '#3a3941', text: '#e7e2da', accent: '#ef7c2f' },
  { id: 'light', label: 'Seshat Light', scheme: 'light', bg: '#f7f7f5', panel: '#ffffff', text: '#171717', accent: '#ef7c2f' }
]

const PRESETS: ThemeSeed[] = [
  // Dark
  { id: 'carbon', label: 'Carbon', scheme: 'dark', bg: '#0c0c0d', panel: '#161617', text: '#e4e4e6', accent: '#d9622a' },
  { id: 'graphite', label: 'Graphite', scheme: 'dark', bg: '#202124', panel: '#2b2d31', text: '#e6e7e9', accent: '#5b86b8' },
  { id: 'midnight', label: 'Midnight', scheme: 'dark', bg: '#0e1420', panel: '#172033', text: '#dde5f2', accent: '#4f7fe0' },
  { id: 'orbit', label: 'Orbit', scheme: 'dark', bg: '#15172b', panel: '#1e2140', text: '#dfe1f5', accent: '#6c7bf0' },
  { id: 'tide', label: 'Tide', scheme: 'dark', bg: '#14232b', panel: '#1b303a', text: '#dbe9ee', accent: '#2a93b5' },
  { id: 'after-rain', label: 'After rain', scheme: 'dark', bg: '#1b2420', panel: '#25322c', text: '#dde8e0', accent: '#3f9568' },
  { id: 'aurora', label: 'Aurora', scheme: 'dark', bg: '#0f2027', panel: '#17313a', text: '#d9f1ee', accent: '#1f9d86' },
  { id: 'phosphor', label: 'Phosphor', scheme: 'dark', bg: '#0b130d', panel: '#132017', text: '#bdf5c8', accent: '#2a9a49' },
  { id: 'kanagawa', label: 'Kanagawa', scheme: 'dark', bg: '#1f1f28', panel: '#2a2a37', text: '#dcd7ba', accent: '#6d86c9' },
  { id: 'mirage', label: 'Mirage', scheme: 'dark', bg: '#1f2430', panel: '#2a3040', text: '#d9dce4', accent: '#c7762a' },
  { id: 'violet-hour', label: 'Violet hour', scheme: 'dark', bg: '#1f1a2e', panel: '#2b2440', text: '#e8e1f5', accent: '#9b6dff' },
  { id: 'nebula', label: 'Nebula', scheme: 'dark', bg: '#1a1426', panel: '#261c38', text: '#eadff5', accent: '#d04fa6' },
  { id: 'dusk', label: 'Dusk', scheme: 'dark', bg: '#251d26', panel: '#342833', text: '#ecdfe3', accent: '#d9684a' },
  { id: 'ember', label: 'Ember', scheme: 'dark', bg: '#261a17', panel: '#34231f', text: '#f0e0d6', accent: '#e5582d' },
  // Light
  { id: 'shine', label: 'Shine', scheme: 'light', bg: '#fbfaf6', panel: '#ffffff', text: '#1a1a1a', accent: '#d17a22' },
  { id: 'paper', label: 'Paper', scheme: 'light', bg: '#f6f3ec', panel: '#fffefb', text: '#25221d', accent: '#8a5a2b' },
  { id: 'alpine', label: 'Alpine', scheme: 'light', bg: '#f2f6f9', panel: '#ffffff', text: '#14232d', accent: '#2b7bb9' },
  { id: 'frost', label: 'Frost', scheme: 'light', bg: '#eef4f8', panel: '#fafdff', text: '#17303f', accent: '#3b8fc4' },
  { id: 'dune', label: 'Dune', scheme: 'light', bg: '#f5eddf', panel: '#fbf6ec', text: '#3a2f22', accent: '#b8742e' },
  { id: 'daybreak', label: 'Daybreak', scheme: 'light', bg: '#fdf6e6', panel: '#fffdf6', text: '#2f2a1b', accent: '#b97f0a' },
  { id: 'peach', label: 'Peach', scheme: 'light', bg: '#fdf1e8', panel: '#fffaf5', text: '#3d2a1f', accent: '#e0703a' },
  { id: 'sherbet', label: 'Sherbet', scheme: 'light', bg: '#fff1ea', panel: '#fffaf7', text: '#3a2420', accent: '#d8466f' },
  { id: 'blossom', label: 'Blossom', scheme: 'light', bg: '#fbf1f3', panel: '#fffafb', text: '#3a2330', accent: '#c94f7c' },
  { id: 'lilac', label: 'Lilac', scheme: 'light', bg: '#f3eff9', panel: '#fbf9fe', text: '#2a2140', accent: '#7d5bd0' },
  { id: 'seafoam', label: 'Seafoam', scheme: 'light', bg: '#ecf6f2', panel: '#f9fdfb', text: '#14302a', accent: '#23917a' }
]

export const THEMES: readonly ThemeSeed[] = [...SESHAT, ...PRESETS]

/** The ids a person can pick, as stored. "auto" follows the operating system and is not a theme of its own. */
export type ThemeId = (typeof THEMES)[number]['id']

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((theme) => theme.id === value)
}

export function themeById(id: string): ThemeSeed | undefined {
  return THEMES.find((theme) => theme.id === id)
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
export function codeBackground(seed: ThemeSeed): string {
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
export function buildTokens(seed: ThemeSeed): ThemeTokens {
  const dark = seed.scheme === 'dark'
  const status = STATUS[seed.scheme]
  return {
    '--surface-root': seed.bg,
    '--surface-sidebar': dark ? mix(seed.bg, '#000000', 0.14) : mix(seed.bg, seed.text, 0.04),
    '--surface-panel': seed.panel,
    '--surface-muted': mix(seed.panel, seed.text, 0.08),
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
