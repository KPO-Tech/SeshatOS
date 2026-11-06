import { isReservedName, tryParseExpression } from '../view/charts/expression'
import type { UiError, UiNode } from './types'

// The pure part of the variables of an answer (ADR 0014): the sliders a reader moves, the numbers they hold, and the text that shows them.
// A variable is only a number kept in the block. A formula reads it by name, through the same safe reader of formulas as a Curve: nothing
// here runs code from the answer.

export const VAR_LIMITS = {
  /** Variables (Slider, Toggle, Select) in one block. */
  variables: 12,
  /** Choices of a Select. */
  options: 12,
  /** Characters of the name of a variable. */
  name: 16,
  /** Characters of the text of a Live. */
  live: 1200,
  /** Steps a slider can have from end to end: a finer step is rounded to this. */
  steps: 2000
} as const

/** A variable is named like an identifier, so that a formula can read it: a, b, h, amp, k_2. */
export const VAR_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

// The arguments of a mark of a Plot that may be a formula in the variables.
const MARK_ARGS: Record<string, string[]> = { Curve: ['show'], Dot: ['x', 'y', 'show'], VLine: ['x', 'show'], HLine: ['y', 'show'], Shade: ['from', 'to', 'show'] }

const EXPRESSION = /\{\{\s*([^{}]+?)\s*\}\}/g

/** What sets a variable: a slider, a switch (0 or 1) or a list of choices (the number of the choice, from 0). */
export const VAR_COMPONENTS = ['Slider', 'Toggle', 'Select'] as const

export type SliderSpec = { name: string; min: number; max: number; value: number; step: number }

function isNodeLike(value: unknown): value is UiNode {
  return typeof value === 'object' && value !== null && (value as UiNode).kind === 'element'
}

/** Every node of the tree, the root first. */
export function allNodes(root: UiNode): UiNode[] {
  const found: UiNode[] = []
  const visit = (node: UiNode) => {
    found.push(node)
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk)
      else if (isNodeLike(value)) visit(value)
    }
    Object.values(node.props).forEach(walk)
  }
  visit(root)
  return found
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** The step a slider moves by: the one asked, or a hundredth of its span rounded to a round figure, never finer than the limit allows. */
function stepOf(min: number, max: number, asked: unknown): number {
  const span = max - min
  const least = span / VAR_LIMITS.steps
  if (typeof asked === 'number' && asked > 0 && Number.isFinite(asked)) return Math.max(asked, least)
  const magnitude = Math.pow(10, Math.floor(Math.log10(span / 100)))
  return Math.max(magnitude, least)
}

/** The slider a node describes, or null when it cannot be one (bad name, empty range). */
export function sliderOf(node: Pick<UiNode, 'props'>): SliderSpec | null {
  const name = typeof node.props.name === 'string' ? node.props.name.trim() : ''
  const min = node.props.min
  const max = node.props.max
  if (!VAR_NAME.test(name) || name.length > VAR_LIMITS.name || isReservedName(name)) return null
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null
  const value = typeof node.props.value === 'number' && Number.isFinite(node.props.value) ? node.props.value : min
  return { name, min, max, value: clamp(value, min, max), step: stepOf(min, max, node.props.step) }
}

/** A Toggle is a variable that is 0 or 1. */
export function toggleOf(node: Pick<UiNode, 'props'>): SliderSpec | null {
  const name = typeof node.props.name === 'string' ? node.props.name.trim() : ''
  if (!VAR_NAME.test(name) || name.length > VAR_LIMITS.name || isReservedName(name)) return null
  return { name, min: 0, max: 1, value: node.props.value === true || node.props.value === 1 ? 1 : 0, step: 1 }
}

/** The labels of a Select, at most the limit. */
export function optionsOf(node: Pick<UiNode, 'props'>): string[] {
  return Array.isArray(node.props.options) ? node.props.options.slice(0, VAR_LIMITS.options).map(String) : []
}

/** A Select is a variable that is the number of the choice made, from 0. */
export function selectOf(node: Pick<UiNode, 'props'>): SliderSpec | null {
  const name = typeof node.props.name === 'string' ? node.props.name.trim() : ''
  const options = optionsOf(node)
  if (!VAR_NAME.test(name) || name.length > VAR_LIMITS.name || isReservedName(name) || options.length < 2) return null
  const asked = typeof node.props.value === 'number' && Number.isFinite(node.props.value) ? Math.round(node.props.value) : 0
  return { name, min: 0, max: options.length - 1, value: clamp(asked, 0, options.length - 1), step: 1 }
}

function variableOf(node: UiNode): SliderSpec | null {
  return node.name === 'Slider' ? sliderOf(node) : node.name === 'Toggle' ? toggleOf(node) : node.name === 'Select' ? selectOf(node) : null
}

/** The variables of a block (sliders, switches, choices), in the order they are written, the first of a name winning. */
export function slidersOf(root: UiNode): SliderSpec[] {
  const seen = new Set<string>()
  const sliders: SliderSpec[] = []
  for (const node of allNodes(root)) {
    if (!(VAR_COMPONENTS as readonly string[]).includes(node.name)) continue
    const spec = variableOf(node)
    if (!spec || seen.has(spec.name)) continue
    seen.add(spec.name)
    sliders.push(spec)
  }
  return sliders.slice(0, VAR_LIMITS.variables)
}

/** What each variable holds when nothing was moved. */
export function defaultsOf(sliders: SliderSpec[]): Record<string, number> {
  return Object.fromEntries(sliders.map((slider) => [slider.name, slider.value]))
}

/** The values to start from: the defaults, with what the reader had set before when it still fits its slider. */
export function startValues(sliders: SliderSpec[], stored: Record<string, unknown> | null): Record<string, number> {
  const values = defaultsOf(sliders)
  if (!stored) return values
  for (const slider of sliders) {
    const kept = stored[slider.name]
    if (typeof kept === 'number' && Number.isFinite(kept)) values[slider.name] = clamp(kept, slider.min, slider.max)
  }
  return values
}

/** A number as a reader wants to see it: four significant figures at most, no trailing zeros, no exponent for ordinary sizes. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const rounded = Number(value.toPrecision(4))
  const abs = Math.abs(rounded)
  return abs >= 1e6 || abs < 1e-4 ? rounded.toExponential(2) : String(rounded)
}

/**
 * The text of a Live with each {{formula}} replaced by its value, the variables read at their current value. A formula that cannot be read
 * or has no value gives a dash; one pass, so a result is never read again.
 */
export function fillLive(text: string, values: Record<string, number>): string {
  const filled = text.replace(EXPRESSION, (_whole, source: string) => {
    const parsed = tryParseExpression(source, values)
    return parsed.formula ? formatNumber(parsed.formula(0)) : '—'
  })
  return filled.length > VAR_LIMITS.live * 2 ? filled.slice(0, VAR_LIMITS.live * 2) : filled
}

/** What a block of sliders may not do, told to the model so that it writes the block again. */
export function checkVars(root: UiNode): UiError[] {
  const errors: UiError[] = []
  const problem = (message: string, hint?: string) => errors.push({ code: 'bad-argument', message, hint })
  const nodes = allNodes(root)
  const sliders = nodes.filter((node) => (VAR_COMPONENTS as readonly string[]).includes(node.name))
  const names = new Set<string>()
  for (const node of sliders) {
    const name = typeof node.props.name === 'string' ? node.props.name.trim() : ''
    if (!VAR_NAME.test(name) || name.length > VAR_LIMITS.name) problem(`The name "${name}" of a ${node.name} is not valid.`, 'Use letters, digits and _, starting with a letter, as a, b or amp.')
    else if (isReservedName(name)) problem(`The name "${name}" of a ${node.name} is already used by formulas (x, pi, e, sin...).`, 'Use another letter.')
    else if (names.has(name)) problem(`The ${node.name} name "${name}" is used twice.`)
    names.add(name)
    const { min, max } = node.props
    if (node.name === 'Select' && optionsOf(node).length < 2) problem(`The Select "${name}" needs at least two options.`)
    if (Array.isArray(node.props.options) && node.props.options.length > VAR_LIMITS.options) problem(`A Select holds at most ${VAR_LIMITS.options} options.`)
    if (typeof min === 'number' && typeof max === 'number' && max <= min) problem(`The Slider "${name}" has max ${max} not above min ${min}.`)
  }
  if (sliders.length > VAR_LIMITS.variables) problem(`A block holds at most ${VAR_LIMITS.variables} Sliders, Toggles and Selects together.`)

  const defaults = defaultsOf(slidersOf(root))
  // A mark or a bound written as a formula must be readable with the sliders given.
  for (const node of nodes) {
    for (const key of MARK_ARGS[node.name] ?? []) {
      const value = node.props[key]
      if (typeof value !== 'string') continue
      const parsed = tryParseExpression(value, defaults)
      if (parsed.error) problem(`${node.name} ${key} "${value}" cannot be read: ${parsed.error}.`, 'Name a Slider for each letter, and write * between a number and a variable (2*a).')
    }
  }
  for (const node of nodes) {
    if (node.name !== 'Live' || typeof node.props.text !== 'string') continue
    if (node.props.text.length > VAR_LIMITS.live) problem(`The text of a Live is longer than ${VAR_LIMITS.live} characters.`)
    for (const match of node.props.text.matchAll(EXPRESSION)) {
      const parsed = tryParseExpression(match[1], defaults)
      if (parsed.error) problem(`A Live shows {{${match[1]}}}, which cannot be read: ${parsed.error}.`, 'Name a Slider for each letter, and write * between a number and a variable (2*a).')
    }
  }
  return errors
}
