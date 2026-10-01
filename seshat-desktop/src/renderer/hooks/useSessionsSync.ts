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

// Loads the session list once so the sidebar's Recents and the search modal
// have something to show. Messages stay empty until a conversation is opened.
export function useSessionsSync() {
  useEffect(() => {
    let cancelled = false
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
        // The sidebar can stay empty while the backend is still starting.
      })
    return () => { cancelled = true }
  }, [])
}
