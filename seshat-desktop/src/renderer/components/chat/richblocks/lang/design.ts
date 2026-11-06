import { allNodes } from './vars'
import type { UiError, UiNode } from './types'

// The pure part of the design pieces of an answer (ADR 0016): the colours a model may choose and what is refused. A colour is a hex code
// and nothing else: it is never put in a style as free text, so a model cannot write CSS, a URL or a script through it.

export const DESIGN_LIMITS = {
  /** Features of a Features, swatches of a Palette, links of a Nav or a Footer. */
  features: 8,
  swatches: 12,
  links: 8,
  /** Columns of a Grid. */
  columns: 4,
  /** Characters of a title, a text or a label. */
  text: 400
} as const

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** The colour a value names as #rrggbb in lower case, or null when it is not a hex code (#abc or #aabbcc). */
export function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!HEX.test(trimmed)) return null
  const body = trimmed.slice(1).toLowerCase()
  return `#${body.length === 3 ? [...body].map((digit) => digit + digit).join('') : body}`
}

/** The colour of the text to put on a colour: dark on a light one, white on a dark one. */
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

export const DESIGN_COMPONENTS = ['Browser', 'Nav', 'Hero', 'Features', 'Feature', 'Grid', 'Picture', 'Palette', 'Swatch', 'Footer'] as const

// The arguments that hold a colour, by component.
const COLOR_ARGS: Record<string, string[]> = { Browser: ['bg'], Nav: ['color'], Hero: ['color'], Feature: ['color'], Picture: ['color'], Swatch: ['color'] }

export function checkDesign(root: UiNode): UiError[] {
  const errors: UiError[] = []
  const problem = (message: string, hint?: string) => errors.push({ code: 'bad-argument', message, hint })
  const nodes = allNodes(root)
  for (const node of nodes) {
    for (const key of COLOR_ARGS[node.name] ?? []) {
      const value = node.props[key]
      if (typeof value === 'string' && value !== '' && safeColor(value) === null) problem(`${node.name} ${key} "${value}" is not a colour.`, 'Write a hex code, as #3b82f6 or #fff.')
    }
    const count = (key: string) => (Array.isArray(node.props[key]) ? (node.props[key] as unknown[]).length : 0)
    if (node.name === 'Features' && count('items') > DESIGN_LIMITS.features) problem(`Features holds at most ${DESIGN_LIMITS.features} items.`)
    if (node.name === 'Palette' && count('swatches') > DESIGN_LIMITS.swatches) problem(`A Palette holds at most ${DESIGN_LIMITS.swatches} swatches.`)
    if ((node.name === 'Nav' || node.name === 'Footer') && count('links') > DESIGN_LIMITS.links) problem(`A ${node.name} holds at most ${DESIGN_LIMITS.links} links.`)
    if (node.name === 'Browser' && nodes.some((other) => other !== node && other.name === 'Browser' && isNested(node, other))) problem('A Browser cannot hold another Browser.')
    for (const key of ['title', 'subtitle', 'text', 'brand', 'label']) {
      const value = node.props[key]
      if (DESIGN_COMPONENTS.includes(node.name as (typeof DESIGN_COMPONENTS)[number]) && typeof value === 'string' && value.length > DESIGN_LIMITS.text) problem(`The ${key} of a ${node.name} is longer than ${DESIGN_LIMITS.text} characters.`)
    }
  }
  return errors
}

/** True when `inner` is somewhere inside `outer`. */
function isNested(outer: UiNode, inner: UiNode): boolean {
  return allNodes(outer).some((node) => node === inner) && outer !== inner
}
