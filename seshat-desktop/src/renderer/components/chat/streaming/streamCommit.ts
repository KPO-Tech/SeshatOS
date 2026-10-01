import type { Message } from '@renderer/api/types'
import type { DonePayload } from '@renderer/components/chat/streaming/runtimeTypes'
import { normalizeSessionMessages, statusFromResult, toolResultFromDone } from '@renderer/lib/chat'
import { streamingToContentBlocks, useSessionStore } from '@renderer/stores/session'

type SessionStore = ReturnType<typeof useSessionStore.getState>

export function commitDonePayload(
  sessionId: string,
  assistantMessageId: string,
  payload: DonePayload,
  store: SessionStore,
) {
  // done carries the authoritative final turn_number/usage for the whole
  // exchange; turn.completed only reflects one runtime turn.
  if (payload.turn_number != null || payload.usage) {
    store.updateAgentState(sessionId, {
      ...(payload.turn_number != null ? { turnNumber: payload.turn_number } : {}),
      ...(payload.usage?.input_tokens != null ? { inputTokens: payload.usage.input_tokens } : {}),
      ...(payload.usage?.output_tokens != null ? { outputTokens: payload.usage.output_tokens } : {}),
    })
  }

  if (Array.isArray(payload.messages)) {
    const normalized = normalizeSessionMessages(payload.messages)
    preserveLocalUserAttachments(sessionId, normalized, store)
    attachDoneResults(normalized, payload.tool_results ?? [])
    store.updateSession(sessionId, { messages: normalized })
    return
  }

  const content = streamingToContentBlocks(store.getStreaming(sessionId))
  store.updateMessage(sessionId, assistantMessageId, (message) => ({ ...message, content }))
}

function preserveLocalUserAttachments(
  sessionId: string,
  messages: Message[],
  store: SessionStore,
) {
  const existing = store.sessions.find((session) => session.id === sessionId)?.messages ?? []
  const localById = new Map(
    existing
      .filter((message) => message.id && message.role === 'user' && Array.isArray(message.metadata?.attachments))
      .map((message) => [message.id as string, message]),
  )
  const localUserMessages = existing.filter((message) => message.role === 'user' && Array.isArray(message.metadata?.attachments))
  if (localUserMessages.length === 0 && localById.size === 0) return

  const used = new Set<number>()
  let userOrdinal = 0
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const message = messages[messageIndex]
    if (message.role !== 'user') continue
    const currentOrdinal = userOrdinal
    userOrdinal++
    if (message.role !== 'user' || message.metadata?.attachments) continue

    const byId = message.id ? localById.get(message.id) : undefined
    if (byId?.metadata?.attachments) {
      message.metadata = { ...message.metadata, attachments: byId.metadata.attachments }
      continue
    }

    const byOrdinal = localUserMessages[currentOrdinal]
    if (byOrdinal?.metadata?.attachments && !used.has(currentOrdinal)) {
      used.add(currentOrdinal)
      message.metadata = { ...message.metadata, attachments: byOrdinal.metadata.attachments }
      continue
    }

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    const matchIndex = localUserMessages.findIndex((local, index) => {
      if (used.has(index)) return false
      const localText = local.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
      return localText === text
    })
    if (matchIndex < 0) continue
    used.add(matchIndex)
    message.metadata = {
      ...message.metadata,
      attachments: localUserMessages[matchIndex].metadata?.attachments,
    }
  }
}

function attachDoneResults(messages: Message[], results: NonNullable<DonePayload['tool_results']>) {
  if (results.length === 0) return
  const normalized = normalizeSessionMessages(messages)
  for (const result of results) {
    const rendered = toolResultFromDone(result)
    if (!rendered) continue
    for (const message of normalized) {
      for (const block of message.content) {
        if (block.type !== 'tool_use' || block.id !== result.id) continue
        block._result = rendered
        block._status = statusFromResult(rendered)
      }
    }
  }
  messages.splice(0, messages.length, ...normalized)
}
