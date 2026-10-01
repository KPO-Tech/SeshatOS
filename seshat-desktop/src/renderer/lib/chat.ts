import type {
  ContentBlock,
  Message,
  ToolRenderResult,
  ToolResultBlock,
  ToolStatus,
  ToolUseBlock,
} from '@renderer/api/types'

function cloneContentBlock(block: ContentBlock): ContentBlock {
  if (block.type === 'text') return { ...block }
  if (block.type === 'thinking') return { ...block }
  if (block.type === 'tool_result') return { ...block }
  return {
    ...block,
    input: { ...block.input },
    metadata: block.metadata ? { ...block.metadata } : undefined,
    _approval: block._approval
      ? {
          ...block._approval,
          toolInput: { ...block._approval.toolInput },
        }
      : undefined,
    _result: block._result
      ? {
          ...block._result,
          metadata: block._result.metadata ? { ...block._result.metadata } : undefined,
        }
      : undefined,
    _partialInput: block._partialInput,
    _message: block._message,
  }
}

export function cloneMessage(message: Message): Message {
  return {
    ...message,
    metadata: message.metadata ? { ...message.metadata } : undefined,
    content: message.content.map(cloneContentBlock),
  }
}

export function cloneMessages(messages: Message[]): Message[] {
  return messages.map(cloneMessage)
}

export function normalizeSessionMessages(messages: Message[]): Message[] {
  const normalized: Message[] = []
  const toolById = new Map<string, ToolUseBlock>()

  for (const message of messages) {
    const cloned = cloneMessage(message)

    if (
      cloned.role === 'user' &&
      cloned.content.length > 0 &&
      cloned.content.every((block) => block.type === 'tool_result')
    ) {
      for (const block of cloned.content as ToolResultBlock[]) {
        const tool = toolById.get(block.tool_use_id)
        if (!tool) continue
        const content =
          typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content, null, 2)
        const metadata = block.metadata ? { ...block.metadata } : undefined
        const durationMs = typeof metadata?.execution_duration_ms === 'number'
          ? metadata.execution_duration_ms
          : undefined
        tool._result = {
          content,
          isError: Boolean(block.is_error),
          durationMs,
          metadata,
        }
        tool._status = block.is_error ? 'failed' : 'completed'
      }
      continue
    }

    for (const block of cloned.content) {
      if (block.type !== 'tool_use') continue
      toolById.set(block.id, block)
      if (!block._status) {
        block._status = block._result?.isError
          ? 'failed'
          : block._result
            ? 'completed'
            : undefined
      }
    }

    normalized.push(cloned)
  }

  return normalized
}

export function toolResultFromDone(result?: {
  content?: string
  is_error?: boolean
  duration_ms?: number
  metadata?: Record<string, unknown>
}): ToolRenderResult | undefined {
  if (!result) return undefined
  return {
    content: result.content ?? '',
    isError: result.is_error ?? false,
    durationMs: result.duration_ms,
    metadata: result.metadata ? { ...result.metadata } : undefined,
  }
}

export function updateToolStatus(
  messages: Message[],
  toolUseId: string,
  patch: Partial<ToolUseBlock>,
) {
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'tool_use' && block.id === toolUseId) {
        Object.assign(block, patch)
        return
      }
    }
  }
}

export function findLatestToolUseByName(messages: Message[], toolName: string): ToolUseBlock | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content ?? []
    for (let j = content.length - 1; j >= 0; j--) {
      const block = content[j]
      if (block.type !== 'tool_use') continue
      if (block.name !== toolName) continue
      if (block._status === 'completed' || block._status === 'failed') continue
      return block
    }
  }
  return null
}

export function statusFromResult(result?: ToolRenderResult): ToolStatus | undefined {
  if (!result) return undefined
  return result.isError ? 'failed' : 'completed'
}
