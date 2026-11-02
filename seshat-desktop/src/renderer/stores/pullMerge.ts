import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const EMPTY: readonly string[] = []

type PullMergeState = {
  // Per session, the addresses of the pull requests the person asked to merge as soon as they are ready (see useMergeWhenReady). Kept
  // across launches: the consent is given once, and the checks can take longer than the app stays open.
  armed: Record<string, string[]>
  arm: (sessionId: string, url: string) => void
  disarm: (sessionId: string, url: string) => void
}

export const usePullMergeStore = create<PullMergeState>()(
  persist(
    (set) => ({
      armed: {},
      arm: (sessionId, url) =>
        set((s) => {
          const current = s.armed[sessionId] ?? []
          return current.includes(url) ? s : { armed: { ...s.armed, [sessionId]: [...current, url] } }
        }),
      disarm: (sessionId, url) =>
        set((s) => {
          const remaining = (s.armed[sessionId] ?? []).filter((item) => item !== url)
          const armed = { ...s.armed }
          if (remaining.length > 0) armed[sessionId] = remaining
          else delete armed[sessionId]
          return { armed }
        }),
    }),
    { name: 'seshat-pull-merge' }
  )
)

/** The pull requests of a session waiting to be merged once ready. */
export function useArmedPulls(sessionId: string): readonly string[] {
  return usePullMergeStore((s) => s.armed[sessionId] ?? EMPTY)
}
