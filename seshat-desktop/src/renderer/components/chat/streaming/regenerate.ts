import type { Message } from '@renderer/api/types'
import { isInterruptedTurnNote } from '@renderer/lib/interruptedTurnNote'

/** The text of a message a person wrote, without what they attached. */
function promptText(message: Message): string {
  return message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
}

/**
 * Where the last turn starts: the last message the person wrote (a message made only of tool results is the runtime's
 * separator after a call, and the note after a stopped turn is the runtime's too). Null when the conversation has none.
 */
export function lastPrompt(messages: Message[]): { index: number; text: string } | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'user') continue
    if (message.content.length > 0 && message.content.every((block) => block.type === 'tool_result')) continue
    // Nor is the note the runtime adds after a stopped turn: asking again for that turn's answer must find the prompt before it.
    if (isInterruptedTurnNote(message)) continue
    const text = promptText(message)
    if (text) return { index, text }
  }
  return null
}

/**
 * The conversation as it stands once the last answer is asked for again: the prompt stays where it was and everything
 * after it is dropped, to be replaced by the new answer. Null when the prompt asked again is not the one that started the
 * last turn (an edited prompt, or one that never reached the server): that is a new turn, not a new answer.
 */
export function withoutLastAnswer(messages: Message[], prompt: string): Message[] | null {
  const last = lastPrompt(messages)
  if (!last || last.text !== prompt.trim()) return null
  return messages.slice(0, last.index + 1)
}

/** What the backend answers when the last turn cannot be taken back: the caller then sends the prompt as a new turn. */
export const CANNOT_ASK_AGAIN = 'cannot be asked again'
