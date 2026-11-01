import { useLayoutEffect, useState, type RefObject } from 'react'

/** Rows shown at once in a composer list: past this the list scrolls. */
export const MENU_VISIBLE_ROWS = 4
export const MENU_ROW_HEIGHT = 40

const GAP = 8

/** Which side of its anchor a menu opens on: below when it fits there, else on the side with more room. Measured each time it opens. */
export function useMenuPlacement(open: boolean, anchor: RefObject<HTMLElement | null>, menuHeight: number): 'up' | 'down' {
  const [placement, setPlacement] = useState<'up' | 'down'>('up')
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const rect = anchor.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - GAP
    const above = rect.top - GAP
    setPlacement(below >= menuHeight || below >= above ? 'down' : 'up')
  }, [open, anchor, menuHeight])
  return placement
}
