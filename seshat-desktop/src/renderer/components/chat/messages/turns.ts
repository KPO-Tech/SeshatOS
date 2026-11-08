import type { ContentBlock, Message } from '@renderer/api/types'
import { isCompactionDivider } from '@renderer/lib/compactedHistory'

// A message that holds only tool_result blocks is the separator the runtime
// writes after a tool call, not something a person wrote: it is never shown,
// and it does not end the turn it sits in.
export function isToolResultOnly(message: Message): boolean {
  return message.role === 'user' && message.content.length > 0 && message.content.every((block) => block.type === 'tool_result')
}

/** A tool call whose card is the only way to answer it: hiding it would take the question off the screen. */
function asksTheUser(block: ContentBlock): boolean {
  return block.type === 'tool_use' && block._status === 'awaiting_approval'
}

export type TurnLayout = {
  /** Folded behind the header of the turn this message ends: this row draws nothing of its own. */
  folded: boolean
  /** The steps behind that header, oldest first. Empty for every message that does not end a turn. */
  foldedMessages: Message[]
  /** Index of the message that opens the turn, used as the identity of the turn. */
  turnStart: number
}

/**
 * Splits the conversation into turns and works out which steps fold into them.
 *
 * A turn runs from a message a person wrote (or the top of the conversation) to
 * the next one. Everything the agent did in it, except its last message, has
 * already been read by the time the answer arrives, so it goes behind the
 * "Worked for ..." header of the message that closes the turn.
 */
export function layoutTurns(messages: Message[]): TurnLayout[] {
  const layout: TurnLayout[] = messages.map((_, index) => ({ folded: false, foldedMessages: [], turnStart: index }))
  let start = 0
  for (let index = 0; index <= messages.length; index++) {
    const message = messages[index]
    const opensNext =
      index === messages.length ||
      (message !== undefined && !isToolResultOnly(message) && (message.role === 'user' || isCompactionDivider(message)))
    if (!opensNext) continue
    foldTurn(messages, start, index, layout)
    start = index
  }
  return layout
}

function foldTurn(messages: Message[], start: number, end: number, layout: TurnLayout[]): void {
  for (let index = start; index < end; index++) layout[index].turnStart = start

  const steps: number[] = []
  for (let index = start; index < end; index++) {
    if (messages[index].role === 'assistant') steps.push(index)
  }
  // A single message is the answer itself, or a lone step with nothing before
  // it: there is no run of work to fold.
  if (steps.length < 2) return

  const last = steps[steps.length - 1]
  const folded = steps.slice(0, -1)
  // A turn folds as a whole. A step whose card waits for the user stays on
  // screen, and folding the steps around it would draw them out of order.
  if (folded.some((index) => messages[index].content.some(asksTheUser))) return

  for (const index of folded) layout[index].folded = true
  layout[last].foldedMessages = folded.map((index) => messages[index])
}
