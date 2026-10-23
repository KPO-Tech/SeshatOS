type MessageLike = { role: string; content: ReadonlyArray<{ type: string }> }

/**
 * Runs `collect` on the messages of each turn and keeps what it finds under the message that ends the turn (the last one before
 * the next user message, or the last one of the list once nothing is streaming). The key is the message index.
 */
export function byTurnEnd<M extends MessageLike, T>(
  messages: readonly M[],
  streaming: boolean,
  collect: (turn: readonly M[]) => T[]
): Map<number, T[]> {
  const result = new Map<number, T[]>()
  let turnStart = -1
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      turnStart = i
      continue
    }
    const next = messages[i + 1]
    const endsTurn = !next || next.role === 'user'
    if (!endsTurn) continue
    if (!next && streaming) continue
    const found = collect(messages.slice(turnStart + 1, i + 1))
    if (found.length > 0) result.set(i, found)
  }
  return result
}
