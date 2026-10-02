export const UNTITLED_SESSION_TITLE = 'Unnamed session'
const LEGACY_UNTITLED_SESSION_TITLE = 'Untitled conversation'

export function isUntitledSessionTitle(title?: string | null): boolean {
  const normalized = (title ?? '').trim()
  const lower = normalized.toLowerCase()
  return (
    normalized === '' ||
    normalized === UNTITLED_SESSION_TITLE ||
    normalized === LEGACY_UNTITLED_SESSION_TITLE ||
    lower === 'new chat' ||
    lower.startsWith('untitled_session_')
  )
}
