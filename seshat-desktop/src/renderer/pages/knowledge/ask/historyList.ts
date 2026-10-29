import type { ChatSession } from '@renderer/stores/session'

export const KNOWLEDGE_SOURCE = 'knowledge'

/** The conversations of the Ask view, the latest first. The chat's own conversations are left out. */
export function askSessions(sessions: readonly ChatSession[]): ChatSession[] {
  const when = (session: ChatSession) => Date.parse(session.updatedAt ?? session.createdAt) || 0
  return sessions.filter((session) => session.source === KNOWLEDGE_SOURCE).sort((a, b) => when(b) - when(a))
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", or the date for older ones. */
export function ago(iso: string | undefined, now = Date.now()): string {
  const time = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(time)) return ''
  const minutes = Math.floor((now - time) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(time).toLocaleDateString()
}
