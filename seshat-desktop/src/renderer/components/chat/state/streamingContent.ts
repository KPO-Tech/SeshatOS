import type { ContentBlock } from '@renderer/api/types'
import type { StreamingBlock } from '@renderer/components/chat/state/sessionTypes'

export function streamingToContentBlocks(streaming: StreamingBlock[]): ContentBlock[] {
  return streaming.map((block) => {
    if (block.type === 'text') return { type: 'text', text: block.text }
    if (block.type === 'thinking') return { type: 'thinking', thinking: block.thinking }
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: { ...block.input },
      metadata: block.metadata ? { ...block.metadata } : undefined,
      _status: block._status,
      _result: block._result
        ? {
            ...block._result,
            metadata: block._result.metadata ? { ...block._result.metadata } : undefined,
          }
        : undefined,
      _approval: block._approval ? { ...block._approval, toolInput: { ...block._approval.toolInput } } : undefined,
      _prompt: block._prompt
        ? {
            ...block._prompt,
            options: block._prompt.options ? block._prompt.options.map((option) => ({ ...option })) : undefined,
            metadata: block._prompt.metadata ? { ...block._prompt.metadata } : undefined,
          }
        : undefined,
      _partialInput: block._partialInput,
      _message: block._message,
    }
  })
}
