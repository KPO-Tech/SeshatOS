import { notify } from '@renderer/stores/notifications'
import { useSessionStore } from '@renderer/stores/session'

/** Whether the person has this conversation open: then they see the answer arrive, and nothing needs to tell them. */
function isViewing(sessionId: string): boolean {
  return window.location.hash.startsWith(`#/conversation/${sessionId}`)
}

function titleOf(sessionId: string): string {
  return useSessionStore.getState().sessions.find((session) => session.id === sessionId)?.title ?? 'Conversation'
}

/**
 * The agent finished its work: the person is told when they are in another conversation or page, or when SeshatOS is not the window in
 * front (the system then shows it, on Windows, macOS and Linux).
 */
export function announceAgentDone(sessionId: string) {
  notify('agent', { title: 'The agent has finished', body: titleOf(sessionId), route: `/conversation/${sessionId}` }, { viewing: isViewing(sessionId) })
}

/** The agent stopped with an error, in a conversation the person may not be looking at. */
export function announceAgentFailed(sessionId: string, reason: string) {
  notify('error', { title: 'The agent stopped with an error', body: `${titleOf(sessionId)}: ${reason}`.slice(0, 200), route: `/conversation/${sessionId}` }, { viewing: isViewing(sessionId) })
}
