import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { StreamingBlock } from '@renderer/stores/session'

type UseConversationScrollArgs = {
  messageCount: number
  streaming: StreamingBlock[]
}

export function useConversationScroll({ messageCount, streaming }: UseConversationScrollArgs) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)

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
      isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 60
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

  return { scrollRef, rowVirtualizer }
}
