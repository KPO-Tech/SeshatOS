import { api } from '@renderer/api/client'
import type { Session } from '@renderer/api/types'
import { isUntitledSessionTitle } from '@renderer/lib/sessionTitle'
import { useSessionStore } from '@renderer/stores/session'

const TITLE_POLL_INTERVAL_MS = 1500
const TITLE_POLL_MAX_ATTEMPTS = 10

// Picks up a title that was not delivered over the stream (it arrived after
// the turn ended, or only a provisional one was). Stops as soon as a generated
// title is known to have been applied.
export async function pollForGeneratedTitle(sessionId: string, hasFinalTitle: () => boolean) {
  for (let attempt = 0; attempt < TITLE_POLL_MAX_ATTEMPTS && !hasFinalTitle(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, TITLE_POLL_INTERVAL_MS))
    if (hasFinalTitle()) return
    try {
      const detail = await api.get<Session>(`/sessions/${sessionId}`)
      const current = useSessionStore.getState().sessions.find((s) => s.id === sessionId)
      if (!isUntitledSessionTitle(detail.title) && detail.title !== current?.title) {
        useSessionStore.getState().updateSession(sessionId, { title: detail.title })
      }
    } catch {
      return
    }
  }
}
