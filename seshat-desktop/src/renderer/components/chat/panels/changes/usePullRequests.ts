import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { PullCandidate, PullsResult } from '@renderer/lib/pullRequests'

const REFRESH_MS = 60_000

/**
 * The pull requests the agent of a session opened, asked of the backend; a session that opened none asks nothing. It asks again every
 * minute while the window is in front, and once when it comes back, so a hidden panel costs GitHub nothing.
 */
export function usePullRequests(candidates: readonly PullCandidate[]) {
  const [result, setResult] = useState<PullsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const key = candidates.length > 0 ? JSON.stringify(candidates) : ''

  const refresh = useCallback(async () => {
    if (!key) {
      setResult(null)
      return
    }
    setLoading(true)
    try {
      setResult(await api.post<PullsResult>('/pulls/track', { candidates: JSON.parse(key) as PullCandidate[] }))
    } catch {
      // Keeps the last list: a failed refresh must not empty the card.
    } finally {
      setLoading(false)
    }
  }, [key])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { result, loading, refresh }
}
