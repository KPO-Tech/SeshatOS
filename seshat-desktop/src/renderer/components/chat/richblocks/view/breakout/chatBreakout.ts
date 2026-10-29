import { isNode } from '../../lang/parseUi'
import type { UiNode } from '../../lang/types'

/** How far a wide block may go beyond each side of the text column. */
const MAX_EXTRA = 180
/** What it leaves free at each side of the conversation. */
const GUTTER = 16

/** The pixels a block can take beyond each side of the text column, given the width of the conversation and of its column. */
export function breakoutExtra(conversationWidth: number, columnWidth: number): number {
  const room = (conversationWidth - columnWidth) / 2 - GUTTER
  return Math.max(0, Math.min(MAX_EXTRA, Math.floor(room)))
}

const WIDE_COMPONENTS = new Set(['Architecture', 'Table'])

/** True when the block holds a drawing or a table, which read better wider than the text around them. */
export function wantsWidth(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(wantsWidth)
  if (!isNode(node)) return false
  const element: UiNode = node
  return WIDE_COMPONENTS.has(element.name) || Object.values(element.props).some(wantsWidth)
}
