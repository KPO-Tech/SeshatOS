import { allNodes } from './vars'
import type { UiError, UiNode } from './types'

// The pure part of the design pieces of an answer (ADR 0016): the colours a model may choose and what is refused. A colour is read from a
// hex code, from a name of a short fixed list, or from rgb() and hsl() written with numbers, and it always comes out as #rrggbb: what
// reaches a style is that code and never the text the model wrote, so it cannot write CSS, a URL or a script through a colour.

export const DESIGN_LIMITS = {
  /** Features of a Features, swatches of a Palette, links of a Nav or a Footer, logos, stats, plans, features of a plan. */
  features: 8,
  swatches: 12,
  links: 8,
  logos: 8,
  stats: 6,
  plans: 4,
  planFeatures: 8,
  /** Columns of a Grid. */
  columns: 4,
  /** Stops of a gradient. */
  stops: 3,
  /** Characters of a title, a text or a label. */
  text: 400
} as const

// The names of the colours: the ones of the web that a model uses. Anything else is not a colour.
const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', gray: '#6b7280', grey: '#6b7280', silver: '#c0c0c0', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
  yellow: '#eab308', lime: '#84cc16', green: '#22c55e', emerald: '#10b981', teal: '#14b8a6', cyan: '#06b6d4', sky: '#0ea5e9', blue: '#3b82f6',
  indigo: '#6366f1', violet: '#8b5cf6', purple: '#a855f7', fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e', brown: '#92400e', navy: '#1e3a8a',
  gold: '#d4af37', beige: '#f5f5dc', ivory: '#fffff0', cream: '#fffdd0', coral: '#ff7f50', salmon: '#fa8072', crimson: '#dc143c', maroon: '#800000',
  olive: '#808000', mint: '#98ff98', lavender: '#e6e6fa', turquoise: '#40e0d0', slate: '#64748b', charcoal: '#374151'
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i
const HSL = /^hsl\(\s*(\d{1,3})(?:deg)?\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*\)$/i

const two = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')

function fromHsl(h: number, s: number, l: number): string {
  const sat = Math.min(100, s) / 100
  const light = Math.min(100, l) / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${two(f(0) * 255)}${two(f(8) * 255)}${two(f(4) * 255)}`
}

/** The colour a value names as #rrggbb in lower case, or null when it is none: a hex code, a name of the list, rgb(r, g, b) or hsl(h, s%, l%). */
export function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (HEX.test(trimmed)) {
    const body = trimmed.slice(1).toLowerCase()
    return `#${body.length === 3 ? [...body].map((digit) => digit + digit).join('') : body}`
  }
  const named = NAMED[trimmed.toLowerCase()]
  if (named) return named
  const rgb = RGB.exec(trimmed)
  if (rgb) return rgb.slice(1, 4).some((part) => Number(part) > 255) ? null : `#${two(Number(rgb[1]))}${two(Number(rgb[2]))}${two(Number(rgb[3]))}`
  const hsl = HSL.exec(trimmed)
  if (hsl) return Number(hsl[1]) > 360 || Number(hsl[2]) > 100 || Number(hsl[3]) > 100 ? null : fromHsl(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]))
  return null
}

export type Fill = {
  /** The first colour, for what takes the colour of a piece (a border, an icon). */
  base: string
  /** The colours, one to three. */
  stops: string[]
}

/** A colour, or a gradient written "a > b" or "a > b > c" (at most three colours), each read by safeColor; null when one of them is none. */
export function safeFill(value: unknown): Fill | null {
  if (typeof value !== 'string') return null
  const parts = value.split('>').map((part) => safeColor(part))
  if (parts.length > DESIGN_LIMITS.stops || parts.some((part) => part === null)) return null
  return { base: parts[0] as string, stops: parts as string[] }
}

/** The text of a style for a fill: a colour, or a gradient at an angle. */
export function fillCss(fill: Fill, angle = 135): string {
  return fill.stops.length === 1 ? fill.base : `linear-gradient(${angle}deg, ${fill.stops.join(', ')})`
}

/** The colour of the text to put on a colour: dark on a light one, white on a dark one, by contrast. */
export function readableOn(hex: string): '#111827' | '#ffffff' {
  const color = safeColor(hex) ?? '#ffffff'
  const channel = (at: number) => {
    const value = parseInt(color.slice(at, at + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.18 ? '#111827' : '#ffffff'
}

/** The accent used when a piece names no colour, or a colour that is not one. */
export const DEFAULT_ACCENT = '#3b82f6'

// The looks a page can take, from short lists: a font is a family the computer has, a radius is a step.
export const FONTS = ['sans', 'serif', 'mono', 'display'] as const
export const RADII = ['none', 'sm', 'md', 'lg', 'full'] as const
export type FontName = (typeof FONTS)[number]
export type RadiusName = (typeof RADII)[number]

export const FONT_STACKS: Record<FontName, string> = {
  sans: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  display: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif"
}

export const RADIUS_REM: Record<RadiusName, string> = { none: '0', sm: '0.375rem', md: '0.75rem', lg: '1.25rem', full: '999px' }

export const DESIGN_COMPONENTS = [
  'Browser', 'Phone', 'Nav', 'Hero', 'Features', 'Feature', 'Grid', 'Picture', 'Palette', 'Swatch', 'Footer', 'Cta', 'Plans', 'Plan', 'Stats', 'Stat', 'Testimonial', 'Avatar', 'Logos'
] as const

// The arguments that hold a colour or a gradient, by component.
const COLOR_ARGS: Record<string, string[]> = {
  Browser: ['bg'], Phone: ['bg'], Nav: ['color'], Hero: ['color'], Feature: ['color'], Picture: ['color'], Swatch: ['color'], Cta: ['color'], Plan: ['color'], Testimonial: ['color'], Avatar: ['color']
}

const count = (node: UiNode, key: string) => (Array.isArray(node.props[key]) ? (node.props[key] as unknown[]).length : 0)

export function checkDesign(root: UiNode): UiError[] {
  const errors: UiError[] = []
  const problem = (message: string, hint?: string) => errors.push({ code: 'bad-argument', message, hint })
  const nodes = allNodes(root)
  for (const node of nodes) {
    for (const key of COLOR_ARGS[node.name] ?? []) {
      const value = node.props[key]
      if (typeof value === 'string' && value !== '' && safeFill(value) === null) {
        problem(`${node.name} ${key} "${value}" is not a colour.`, 'Write a hex code (#3b82f6), a name (orange), rgb(249, 115, 22) or hsl(25, 95%, 53%); a gradient is "#f97316 > #ec4899".')
      }
    }
    if (node.name === 'Browser' || node.name === 'Phone') {
      for (const [key, allowed] of [['font', FONTS], ['radius', RADII]] as const) {
        const value = node.props[key]
        if (typeof value === 'string' && value !== '' && !(allowed as readonly string[]).includes(value)) problem(`${node.name} ${key} "${value}" is not one of ${allowed.join(', ')}.`)
      }
      if (nodes.some((other) => other !== node && (other.name === 'Browser' || other.name === 'Phone') && isInside(node, other))) problem(`A ${node.name} cannot hold another Browser or Phone.`)
    }
    const limits: Array<[string, string, number, string]> = [
      ['Features', 'items', DESIGN_LIMITS.features, 'items'], ['Palette', 'swatches', DESIGN_LIMITS.swatches, 'swatches'], ['Nav', 'links', DESIGN_LIMITS.links, 'links'],
      ['Footer', 'links', DESIGN_LIMITS.links, 'links'], ['Logos', 'names', DESIGN_LIMITS.logos, 'logos'], ['Stats', 'items', DESIGN_LIMITS.stats, 'stats'],
      ['Plans', 'items', DESIGN_LIMITS.plans, 'plans'], ['Plan', 'features', DESIGN_LIMITS.planFeatures, 'features']
    ]
    for (const [name, key, limit, what] of limits) if (node.name === name && count(node, key) > limit) problem(`${name} holds at most ${limit} ${what}.`)
    if ((DESIGN_COMPONENTS as readonly string[]).includes(node.name)) {
      for (const key of ['title', 'subtitle', 'text', 'brand', 'label', 'quote', 'name', 'value']) {
        const value = node.props[key]
        if (typeof value === 'string' && value.length > DESIGN_LIMITS.text) problem(`The ${key} of a ${node.name} is longer than ${DESIGN_LIMITS.text} characters.`)
      }
    }
  }
  return errors
}

/** True when `inner` is somewhere inside `outer`. */
function isInside(outer: UiNode, inner: UiNode): boolean {
  return allNodes(outer).some((node) => node === inner)
}
