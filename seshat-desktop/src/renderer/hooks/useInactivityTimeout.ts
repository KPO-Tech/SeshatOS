import { useEffect, useRef } from 'react'
import { useAuthStore } from '@renderer/stores/auth'

// Product decision (2026-08-13): 2 days. Long enough not to bounce someone
// mid-work after a coffee break, short enough to sign out an abandoned install.
const DEFAULT_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

// Signs the user out locally after `timeoutMs` without mouse, keyboard or
// scroll activity. Timer lives in a ref so mousemove never triggers a render.
export function useInactivityTimeout(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => useAuthStore.getState().logout(), timeoutMs)
    }

    resetTimer()
    for (const eventName of ACTIVITY_EVENTS) window.addEventListener(eventName, resetTimer, { passive: true })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const eventName of ACTIVITY_EVENTS) window.removeEventListener(eventName, resetTimer)
    }
  }, [isAuthenticated, timeoutMs])
}
