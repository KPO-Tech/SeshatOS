import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FOLLOW_DISTANCE, followAfterPress, followAfterScroll } from '@renderer/lib/followScroll'

type UseConversationScrollArgs = {
  messageCount: number
  /** True while a turn runs: the end of the conversation is followed as the answer grows. */
  following: boolean
}

/** How far from the end the reader must be before a way back down is offered. */
const JUMP_DISTANCE = 240

export function useConversationScroll({ messageCount, following }: UseConversationScrollArgs) {
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

  // When a row changes height, the scroll position follows it only if that keeps what the reader sees in place: while they follow the
  // bottom, and for a row wholly above the screen. Scrolling up measures the rows coming into view from above (they were only estimated),
  // and without the second case each measure pushed the text being read down, by the difference, under the reader. A row the reader is in
  // (the answer being written, read from its middle) never moves the view: its growth goes below.
  // Growth is followed while a turn runs, because that growth is the answer being written. Once it
  // has stopped, the only thing that grows is something the reader opened: following it would pull
  // the view to the end while they are reading what they just unfolded.
  const followGrowth = following
  rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
    (followGrowth && isAtBottomRef.current) || item.end <= (instance.scrollOffset ?? 0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let lastTop = el.scrollTop
    function onScroll() {
      if (!el) return
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      isAtBottomRef.current = followAfterScroll(isAtBottomRef.current, { top: el.scrollTop, lastTop, distance })
      lastTop = el.scrollTop
      setAway(distance > JUMP_DISTANCE)
    }
    // The reader's intent, read from what they do rather than from how far they are: the browser animates a wheel notch over several
    // frames, so the first scroll events of an upward move are still within JUMP of the end, and the follow below used to take the
    // reader back down before they had left. Going up stops the follow at once; it starts again when they come back near the end.
    function leave() {
      isAtBottomRef.current = false
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
    function onWheel(event: WheelEvent) {
      if (!el) return
      // A conversation that fits the window does not scroll: no move to read, nothing to leave, and no scroll event to come back by.
      if (event.deltaY < 0 && el.scrollHeight > el.clientHeight) leave()
      else if (event.deltaY > 0 && el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_DISTANCE) isAtBottomRef.current = true
    }
    let touchY = 0
    function onTouchStart(event: TouchEvent) {
      touchY = event.touches[0]?.clientY ?? 0
    }
    function onTouchMove(event: TouchEvent) {
      if ((event.touches[0]?.clientY ?? 0) > touchY) leave()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') leave()
    }
    // A drag of the scrollbar is a pointer press on the scroller itself, not on a row.
    function onPointerDown(event: PointerEvent) {
      if (!el) return
      if (event.target === el) {
        leave()
        return
      }
      if (!followAfterPress(isAtBottomRef.current, el.scrollHeight - el.scrollTop - el.clientHeight)) leave()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('pointerdown', onPointerDown)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  // Follows the end of the conversation as the total size grows: the answer being written grows its row, which is measured, and a row
  // also grows when a picture has loaded or a tool's result arrives.
  const totalSize = rowVirtualizer.getTotalSize()
  useEffect(() => {
    if (!followGrowth || !isAtBottomRef.current || messageCount === 0) return
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const el = scrollRef.current
      if (el && isAtBottomRef.current) el.scrollTo({ top: el.scrollHeight })
    })
  }, [followGrowth, messageCount, totalSize])

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
