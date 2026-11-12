import type { Message } from '@renderer/api/types'

// When a turn stops early (the person pressed stop, or an error ended it), the runtime keeps what the turn did and adds a message
// for the model: "[The previous turn was interrupted by the user before it finished...]" or "[The previous turn stopped because of
// an error...]", so that a "continue" resumes the work. It is sent with the user's role, but nobody wrote it: it is not drawn, and it
// is not the prompt a retry asks again. See interrupted_turn.go in seshat-runtime and lastTurnPrompt in the backend.
const NOTE_ID_PREFIX = 'msg-interrupted-'
const NOTE_TEXT_PREFIX = '[The previous turn '

export function isInterruptedTurnNote(message: Message): boolean {
  if (message.role !== 'user') return false
  if (message.id?.startsWith(NOTE_ID_PREFIX)) return true
  const first = message.content[0]
  return message.content.length === 1 && first?.type === 'text' && first.text.trimStart().startsWith(NOTE_TEXT_PREFIX)
}
