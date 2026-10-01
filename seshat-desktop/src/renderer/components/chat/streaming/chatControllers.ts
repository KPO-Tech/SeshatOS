// Shared across every useChat(sessionId) instance. A module singleton lets
// any caller stop the active stream for a session, even when another component
// started that turn.
const activeControllers = new Map<string, AbortController>()
const stopRequested = new Set<string>()

export function registerController(sessionId: string, controller: AbortController) {
  activeControllers.set(sessionId, controller)
}

export function clearController(sessionId: string) {
  activeControllers.delete(sessionId)
}

export function abortController(sessionId: string) {
  activeControllers.get(sessionId)?.abort()
}

export function markStopRequested(sessionId: string) {
  stopRequested.add(sessionId)
}

export function clearStopRequested(sessionId: string) {
  stopRequested.delete(sessionId)
}

export function isStopRequested(sessionId: string): boolean {
  return stopRequested.has(sessionId)
}
