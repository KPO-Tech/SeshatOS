import { useLayoutEffect, useState, type RefObject } from 'react'
import { breakoutExtra } from './chatBreakout'

/**
 * The pixels a block may take beyond each side of the text column of the chat. It is measured from the column and from the
 * conversation around it, so it shrinks when a panel opens beside the chat, and is zero anywhere that is not the chat.
 */
export function useChatBreakout(ref: RefObject<HTMLElement | null>, enabled: boolean): number {
  const [extra, setExtra] = useState(0)

  useLayoutEffect(() => {
    const column = enabled ? ref.current?.closest<HTMLElement>('.conv-virtual-row') : null
    const conversation = column?.closest<HTMLElement>('.conv-messages')
    if (!column || !conversation) {
      setExtra(0)
      return
    }
    const measure = () => setExtra(breakoutExtra(conversation.clientWidth, column.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(conversation)
    return () => observer.disconnect()
  }, [ref, enabled])

  return extra
}
