import { useEffect } from 'react'
import { api } from '@renderer/api/client'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'
import { useSessionStore } from '@renderer/stores/session'

type SessionSummary = {
  session_id: string
  title?: string
  created_at: number
  updated_at?: number
  provider_setting_id?: string
  model_id?: string
  source?: string
  project_path?: string
}

// Fetch attempts if the backend isn't accepting connections yet at mount
// time (the common case right after an app launch - the renderer starts
// before the local backend finishes booting). Each retry waits longer than
// the last; after the last attempt, the sidebar just stays on its own
// empty state rather than retrying forever.
const MAX_ATTEMPTS = 5
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000]

// Loads the session list so the sidebar's Recents and the search modal have
// something to show. Messages stay empty until a conversation is opened.
export function useSessionsSync() {
  useEffect(() => {
    let cancelled = false

    function attempt(attemptsLeft: number) {
      api.get<{ sessions: SessionSummary[] }>('/sessions')
        .then((response) => {
          if (cancelled) return
          const { upsertSession } = useSessionStore.getState()
          for (const session of response.sessions ?? []) {
            upsertSession({
              id: session.session_id,
              title: session.title || UNTITLED_SESSION_TITLE,
              messages: [],
              createdAt: new Date((session.created_at ?? 0) * 1000).toISOString(),
              updatedAt: new Date((session.updated_at ?? session.created_at ?? 0) * 1000).toISOString(),
              providerSettingId: session.provider_setting_id,
              modelId: session.model_id,
              source: session.source,
              projectPath: session.project_path || undefined,
            })
          }
        })
        .catch(() => {
          if (cancelled || attemptsLeft <= 1) return
          const delay = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - attemptsLeft] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
          setTimeout(() => {
            if (!cancelled) attempt(attemptsLeft - 1)
          }, delay)
        })
    }

    attempt(MAX_ATTEMPTS)
    return () => { cancelled = true }
  }, [])
}
