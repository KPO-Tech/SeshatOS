import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { PullsResult } from '@renderer/lib/pullRequests'

const REFRESH_MS = 60_000

/**
 * The pull requests of a session and of the person, asked of the backend. It asks again every minute while the window is in front,
 * and once when it comes back, so a hidden panel costs GitHub nothing.
 */
export function usePullRequests(workspacePath: string | undefined, urls: readonly string[]) {
  const [result, setResult] = useState<PullsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const key = urls.join(',')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setResult(await api.post<PullsResult>('/pulls/track', { workspace_path: workspacePath ?? '', urls: key ? key.split(',') : [] }))
    } catch {
      // Keeps the last list: a failed refresh must not empty the card.
    } finally {
      setLoading(false)
    }
  }, [workspacePath, key])

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
