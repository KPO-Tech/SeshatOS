import { api } from '@renderer/api/client'
import type { Session } from '@renderer/api/types'
import { isUntitledSessionTitle } from '@renderer/lib/sessionTitle'
import { useSessionStore } from '@renderer/stores/session'

const TITLE_POLL_INTERVAL_MS = 3000
const TITLE_POLL_MAX_ATTEMPTS = 10

export async function pollForGeneratedTitle(sessionId: string) {
  for (let attempt = 0; attempt < TITLE_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, TITLE_POLL_INTERVAL_MS))
    try {
      const detail = await api.get<Session>(`/sessions/${sessionId}`)
      if (!isUntitledSessionTitle(detail.title)) {
        useSessionStore.getState().updateSession(sessionId, { title: detail.title })
        return
      }
    } catch {
      return
    }
  }
}
