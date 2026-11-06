import { safeFill } from './design'
import { allNodes } from './vars'
import type { UiError, UiNode } from './types'

// The pure part of the diagrams of an answer (ADR 0018): the shapes of a strategy, a method or a structure (a honeycomb, a process, a cycle, a
// pyramid, a matrix, a stack of layers) and what is refused. A model gives the words and the colours; the shape is drawn by the app, so there
// is no free drawing, and the colours are read by the same function as the sketches of a page.

export const DIAGRAM_LIMITS = {
  /** Columns of a Hive, and hexagons in all. */
  hiveColumns: 7,
  hexagons: 21,
  /** Steps of a Chevrons, a Cycle, a Pyramid, a Layers. */
  chevrons: 8,
  loops: 8,
  levels: 7,
  layers: 8,
  /** Cells of a Quadrant. */
  quads: 4,
  /** Nodes of a Tree, levels of a Tree, children of a Branch. */
  nodes: 25,
  depth: 4,
  children: 6,
  /** Characters of a label or a text. */
  text: 160
} as const

/** The colours a shape takes when the model names none, one after the other: calm, distinct, readable with white or dark text. */
export const DIAGRAM_COLOURS = ['#1e3a8a', '#2563eb', '#0ea5e9', '#14b8a6', '#8b5cf6', '#db2777', '#f97316', '#65a30d'] as const

export const DIAGRAM_COMPONENTS = ['Hive', 'Hex', 'Chevrons', 'Chev', 'Cycle', 'Loop', 'Pyramid', 'Level', 'Quadrant', 'Quad', 'Layers', 'Layer', 'Venn', 'VSet', 'Tree', 'Branch'] as const

const COLOR_PARTS = ['Hex', 'Chev', 'Loop', 'Level', 'Quad', 'Layer', 'VSet', 'Branch']

const isNodeLike = (value: unknown): value is UiNode => typeof value === 'object' && value !== null && (value as UiNode).kind === 'element'
const count = (node: UiNode, key: string) => (Array.isArray(node.props[key]) ? (node.props[key] as unknown[]).length : 0)

/** The pieces held by a list prop of a node. */
export const partsOf = (node: Pick<UiNode, 'props'>, key: string): UiNode[] => (Array.isArray(node.props[key]) ? (node.props[key] as unknown[]).filter(isNodeLike) : [])

/** The columns of a Hive, each a list of Hex. */
export function columnsOf(hive: Pick<UiNode, 'props'>): UiNode[][] {
  const columns = Array.isArray(hive.props.columns) ? hive.props.columns : []
  return columns.slice(0, DIAGRAM_LIMITS.hiveColumns).map((column) => (Array.isArray(column) ? (column as unknown[]).filter(isNodeLike) : []))
}

export function checkDiagrams(root: UiNode): UiError[] {
  const errors: UiError[] = []
  const problem = (message: string, hint?: string) => errors.push({ code: 'bad-argument', message, hint })
  for (const node of allNodes(root)) {
    if (COLOR_PARTS.includes(node.name)) {
      const color = node.props.color
      if (typeof color === 'string' && color !== '' && safeFill(color) === null) problem(`${node.name} color "${color}" is not a colour.`, 'Write a hex code (#2563eb), a name (blue), rgb() or hsl(); a gradient is "#2563eb > #0ea5e9".')
    }
    if (node.name === 'Hive') {
      const columns = Array.isArray(node.props.columns) ? node.props.columns : []
      if (columns.length > DIAGRAM_LIMITS.hiveColumns) problem(`A Hive holds at most ${DIAGRAM_LIMITS.hiveColumns} columns.`)
      const hexagons = columns.reduce((total: number, column) => total + (Array.isArray(column) ? column.length : 0), 0)
      if (hexagons > DIAGRAM_LIMITS.hexagons) problem(`A Hive holds at most ${DIAGRAM_LIMITS.hexagons} hexagons.`)
      if (hexagons === 0) problem('A Hive needs at least one Hex.')
    }
    const limits: Array<[string, string, number]> = [['Chevrons', 'items', DIAGRAM_LIMITS.chevrons], ['Cycle', 'loops', DIAGRAM_LIMITS.loops], ['Pyramid', 'levels', DIAGRAM_LIMITS.levels], ['Layers', 'layers', DIAGRAM_LIMITS.layers], ['Quadrant', 'cells', DIAGRAM_LIMITS.quads]]
    for (const [name, key, limit] of limits) if (node.name === name && count(node, key) > limit) problem(`${name} holds at most ${limit} items.`)
    if (node.name === 'Venn' && (count(node, 'sets') < 2 || count(node, 'sets') > 3)) problem('A Venn needs two or three sets.')
    if (node.name === 'Tree') {
      const branches = (n: UiNode, level: number): { total: number; deepest: number } => {
        const kids = partsOf(n, 'children')
        if (kids.length > DIAGRAM_LIMITS.children) problem(`A Branch holds at most ${DIAGRAM_LIMITS.children} children.`)
        return kids.reduce((sum, kid) => {
          const below = branches(kid, level + 1)
          return { total: sum.total + below.total, deepest: Math.max(sum.deepest, below.deepest) }
        }, { total: 1, deepest: level })
      }
      const root = isNodeLike(node.props.root) ? node.props.root : null
      if (!root) problem('A Tree needs a root Branch.')
      else {
        const { total, deepest } = branches(root, 1)
        if (total > DIAGRAM_LIMITS.nodes) problem(`A Tree holds at most ${DIAGRAM_LIMITS.nodes} nodes.`)
        if (deepest > DIAGRAM_LIMITS.depth) problem(`A Tree goes down at most ${DIAGRAM_LIMITS.depth} levels.`)
      }
    }
    if (node.name === 'Cycle' && count(node, 'loops') < 3) problem('A Cycle needs at least three steps.')
    if (node.name === 'Quadrant' && count(node, 'cells') !== DIAGRAM_LIMITS.quads) problem('A Quadrant needs four cells: top left, top right, bottom left, bottom right.')
    if ((DIAGRAM_COMPONENTS as readonly string[]).includes(node.name)) {
      for (const key of ['label', 'text', 'title', 'center', 'left', 'right', 'xLabel', 'yLabel']) {
        const value = node.props[key]
        if (typeof value === 'string' && value.length > DIAGRAM_LIMITS.text) problem(`The ${key} of a ${node.name} is longer than ${DIAGRAM_LIMITS.text} characters.`)
      }
    }
  }
  return errors
}
