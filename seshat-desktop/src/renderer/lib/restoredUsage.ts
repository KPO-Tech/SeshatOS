import type { Message } from '@renderer/api/types'

export type RestoredUsage = {
  turnNumber: number
  inputTokens: number
  outputTokens: number
}

// The runtime keeps the turn count on the session and the token usage of each
// assistant reply on its message metadata, so the Computer panel stats can be
// rebuilt after a restart from the stored transcript instead of starting empty.
export function restoredUsageFromSession(detail: { total_turns?: number; messages?: Message[] }): RestoredUsage | null {
  const messages = detail.messages ?? []
  let inputTokens = 0
  let outputTokens = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const usage = messages[i].role === 'assistant' ? (messages[i].metadata?.usage as { input_tokens?: number; output_tokens?: number } | undefined) : undefined
    if (usage && (usage.input_tokens || usage.output_tokens)) {
      inputTokens = usage.input_tokens ?? 0
      outputTokens = usage.output_tokens ?? 0
      break
    }
  }
  const turnNumber = detail.total_turns ?? 0
  if (turnNumber === 0 && inputTokens === 0 && outputTokens === 0) return null
  return { turnNumber, inputTokens, outputTokens }
}
