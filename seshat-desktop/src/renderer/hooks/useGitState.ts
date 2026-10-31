import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { GitState } from '@renderer/lib/sessionOverview'

const REFRESH_MS = 5_000

/**
 * The git branch of a folder, asked of the backend every few seconds while the window is in front and once when it comes back,
 * so a branch switched in a terminal shows up without a click.
 */
export function useGitState(workspacePath: string | undefined): GitState | null {
  const [state, setState] = useState<GitState | null>(null)

  useEffect(() => {
    setState(null)
    if (!workspacePath) return
    let cancelled = false
    const read = () => {
      if (document.visibilityState !== 'visible') return
      api.post<GitState>('/git/state', { workspace_path: workspacePath })
        .then((next) => {
          if (cancelled) return
          // Keeps the same object when nothing changed, so a quiet repository does not redraw the card every few seconds.
          setState((current) => (current && current.repo === next.repo && current.branch === next.branch && current.dirty === next.dirty && current.detached === next.detached ? current : next))
        })
        .catch(() => undefined)
    }
    read()
    const timer = window.setInterval(read, REFRESH_MS)
    document.addEventListener('visibilitychange', read)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', read)
    }
  }, [workspacePath])

  return state
}
