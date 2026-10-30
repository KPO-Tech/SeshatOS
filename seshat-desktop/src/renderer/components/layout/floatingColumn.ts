import type { RightPanelColumn } from '@renderer/stores/ui'

/** The width of the session cards: as narrow as they read, since they sit beside the chat rather than take part of it. */
export const FLOATING_PANEL_WIDTH = 300

/**
 * A column that holds only the session cards is not a window: it has no border, no shadow, no handle to resize it and the
 * background of the chat, so the cards look set down beside the conversation. A column with a document, a file or a
 * terminal keeps its frame, and so does the session panel once it shows a tool (a search, a page read): that is something to read, which
 * needs the width the panel was opened at and a handle to change it.
 */
export function isFloatingColumn(column: Pick<RightPanelColumn, 'panels'>): boolean {
  return column.panels.length > 0 && column.panels.every((panel) => panel.kind === 'computer' && !panel.focusToolId)
}
