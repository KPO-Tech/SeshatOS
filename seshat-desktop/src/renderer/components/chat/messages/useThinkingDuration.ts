import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '@renderer/stores/ui'
import { thinkingKey } from './thinkingTime'

/**
 * Seconds a thought has taken: counted while it is the part of the answer being written, then kept. Nothing in the
 * backend stamps a thought, so the time is measured here, and a thought from before this was measured shows none.
 */
export function useThinkingDuration(sessionId: string | undefined, text: string, live: boolean): number | null {
  const stored = useUIStore((s) => s.thinkingDurations[thinkingKey(sessionId, text)])
  const setDuration = useUIStore((s) => s.setThinkingDuration)
  const startedAt = useRef<number | null>(null)
  const latestText = useRef(text)
  latestText.current = text
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!live) return
    startedAt.current ??= Date.now()
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(timer)
      const start = startedAt.current
      startedAt.current = null
      if (start !== null) setDuration(thinkingKey(sessionId, latestText.current), Math.max(1, Math.round((Date.now() - start) / 1000)))
    }
  }, [live, sessionId, setDuration])

  if (live) return startedAt.current === null ? 0 : Math.floor((now - startedAt.current) / 1000)
  return stored ?? null
}
