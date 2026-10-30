import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StreamingBlock } from '@renderer/stores/session'

type UseConversationScrollArgs = {
  messageCount: number
  streaming: StreamingBlock[]
}

/** How far from the end the reader must be before a way back down is offered. */
const JUMP_DISTANCE = 240

export function useConversationScroll({ messageCount, streaming }: UseConversationScrollArgs) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const [away, setAway] = useState(false)

  const rowVirtualizer = useVirtualizer({
    count: messageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  })

  // Keep virtual row growth from pulling the reader downward unless they are
  // already following the bottom of the conversation.
  rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => isAtBottomRef.current

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      if (!el) return
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      isAtBottomRef.current = distance <= 60
      setAway(distance > JUMP_DISTANCE)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!isAtBottomRef.current || messageCount === 0) return
    if (scrollRafRef.current !== null) return
    const targetIndex = messageCount - 1
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      if (isAtBottomRef.current) {
        rowVirtualizer.scrollToIndex(targetIndex, { align: 'end', behavior: 'auto' })
      }
    })
  }, [messageCount, streaming]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [])

  // The rows below the reader are only estimated until they are drawn, so the first jump can fall short: the second one, once they are
  // measured, lands on the last line.
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el || messageCount === 0) return
    isAtBottomRef.current = true
    setAway(false)
    rowVirtualizer.scrollToIndex(messageCount - 1, { align: 'end', behavior: 'auto' })
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }))
  }, [messageCount]) // eslint-disable-line react-hooks/exhaustive-deps

  return { scrollRef, rowVirtualizer, away: away && messageCount > 0, scrollToBottom }
}
