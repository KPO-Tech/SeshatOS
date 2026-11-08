import { useEffect, useState } from 'react'
import { useUIStore } from '@renderer/stores/ui'

/**
 * Seconds a turn took, shown on its "Worked for ..." header. Nothing in the
 * backend stamps a turn, so the time is measured here while it runs and kept
 * under a key that a reload does not change.
 *
 * The measurement lives outside the component on purpose: the header moves from
 * one row to the next as the turn adds steps, and a timer owned by the row would
 * start over at every step.
 */
const startedAt = new Map<string, number>()

export function useTurnDuration(key: string, live: boolean): number | null {
  const stored = useUIStore((state) => state.turnDurations[key])
  const setDuration = useUIStore((state) => state.setTurnDuration)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!live) return
    if (!startedAt.has(key)) startedAt.set(key, Date.now())
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearInterval(timer)
      // Written on every step, so the last write of the turn is the whole
      // duration: each one counts from the same start.
      const begin = startedAt.get(key)
      if (begin !== undefined) setDuration(key, Math.max(1, Math.round((Date.now() - begin) / 1000)))
    }
  }, [live, key, setDuration])

  if (!live) return stored ?? null
  const begin = startedAt.get(key)
  return begin === undefined ? 0 : Math.floor((now - begin) / 1000)
}
