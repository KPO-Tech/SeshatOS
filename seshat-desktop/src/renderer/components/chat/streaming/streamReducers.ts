import type { StreamEvent } from '@renderer/api/types'
import { useSessionStore, type StreamingBlock } from '@renderer/stores/session'

type SessionStore = ReturnType<typeof useSessionStore.getState>

export function reduceStreamChunk(currentStreaming: StreamingBlock[], event: StreamEvent): StreamingBlock[] | null {
  switch (event.type) {
    // Ignored events: exit before any work, especially before cloneStreaming().
    case 'message_delta':
    case 'content_block_stop':
    case 'message_stop':
    case 'error':
      return null

    case 'content_block_start': {
      const streaming = cloneStreamingBlocks(currentStreaming)
      if (event.content_block.type === 'tool_result') return null
      if (event.content_block.type === 'tool_use') {
        streaming.push({
          type: 'tool_use',
          index: streaming.length,
          id: event.content_block.id,
          name: event.content_block.name,
          input: { ...event.content_block.input },
          metadata: event.content_block.metadata,
          _status: 'pending',
          _approval: undefined,
          _result: undefined,
          _partialInput: '',
          _message: undefined,
        })
      } else if (event.content_block.type === 'thinking') {
        streaming.push({ type: 'thinking', index: streaming.length, thinking: event.content_block.thinking ?? '' })
      } else {
        streaming.push({ type: 'text', index: streaming.length, text: event.content_block.text ?? '' })
      }
      return streaming
    }

    case 'content_block_delta': {
      const lastIdx = currentStreaming.length - 1
      const last = lastIdx >= 0 ? currentStreaming[lastIdx] : null

      if (last) {
        if (last.type === 'text' && (!event.delta_type || event.delta_type === 'text_delta')) {
          return [...currentStreaming.slice(0, lastIdx), { ...last, text: last.text + (event.delta ?? '') }]
        }
        if (last.type === 'thinking' && event.delta_type === 'thinking_delta') {
          return [...currentStreaming.slice(0, lastIdx), { ...last, thinking: last.thinking + (event.delta ?? '') }]
        }
        if (last.type === 'tool_use' && event.delta_type === 'input_json_delta') {
          const newPartial = `${last._partialInput ?? ''}${event.partial_json ?? ''}`
          return [
            ...currentStreaming.slice(0, lastIdx),
            { ...last, _partialInput: newPartial, input: mergePartialToolInput(last.input, newPartial) },
          ]
        }
      }

      const streaming = cloneStreamingBlocks(currentStreaming)
      let current = streaming[streaming.length - 1]
      if (!current) {
        if (event.delta_type === 'thinking_delta') {
          current = { type: 'thinking', index: 0, thinking: '' }
          streaming.push(current)
        } else {
          current = { type: 'text', index: 0, text: '' }
          streaming.push(current)
        }
      }
      if (!current) return null
      if (event.delta_type === 'thinking_delta' && current.type !== 'thinking') {
        current = { type: 'thinking', index: streaming.length, thinking: '' }
        streaming.push(current)
      } else if ((!event.delta_type || event.delta_type === 'text_delta') && current.type !== 'text') {
        current = { type: 'text', index: streaming.length, text: '' }
        streaming.push(current)
      }
      if (current.type === 'text' && (!event.delta_type || event.delta_type === 'text_delta')) {
        current.text += event.delta ?? ''
      } else if (current.type === 'thinking' && event.delta_type === 'thinking_delta') {
        current.thinking += event.delta ?? ''
      } else if (current.type === 'tool_use' && event.delta_type === 'input_json_delta') {
        current._partialInput = `${current._partialInput ?? ''}${event.partial_json ?? ''}`
        current.input = mergePartialToolInput(current.input, current._partialInput)
      }
      return streaming
    }
  }
}

export function handleSubagentStreamChunk(
  sessionId: string,
  toolUseId: string,
  chunk: StreamEvent,
  store: SessionStore,
) {
  const subagent = store.getSubagent(sessionId, toolUseId)
  if (!subagent) return

  switch (chunk.type) {
    case 'message_delta':
    case 'content_block_stop':
    case 'message_stop':
    case 'error':
      return

    case 'content_block_start': {
      if (chunk.content_block.type === 'tool_result') return
      const index = subagent.streaming.length
      if (chunk.content_block.type === 'tool_use') {
        store.appendSubagentStreamBlock(sessionId, toolUseId, {
          type: 'tool_use',
          index,
          id: chunk.content_block.id,
          name: chunk.content_block.name,
          input: { ...chunk.content_block.input },
          metadata: chunk.content_block.metadata,
          _status: 'pending',
          _partialInput: '',
        })
      } else if (chunk.content_block.type === 'thinking') {
        store.appendSubagentStreamBlock(sessionId, toolUseId, {
          type: 'thinking',
          index,
          thinking: chunk.content_block.thinking ?? '',
        })
      } else {
        store.appendSubagentStreamBlock(sessionId, toolUseId, {
          type: 'text',
          index,
          text: chunk.content_block.text ?? '',
        })
      }
      return
    }

    case 'content_block_delta': {
      const current = store.getSubagent(sessionId, toolUseId)
      if (!current) return
      const lastIdx = current.streaming.length - 1
      const last = lastIdx >= 0 ? current.streaming[lastIdx] : null
      if (!last) return

      if (last.type === 'text' && (!chunk.delta_type || chunk.delta_type === 'text_delta')) {
        store.updateSubagentStreamBlock(sessionId, toolUseId, last.index, {
          ...last,
          text: last.text + (chunk.delta ?? ''),
        })
      } else if (last.type === 'thinking' && chunk.delta_type === 'thinking_delta') {
        store.updateSubagentStreamBlock(sessionId, toolUseId, last.index, {
          ...last,
          thinking: last.thinking + (chunk.delta ?? ''),
        })
      } else if (last.type === 'tool_use' && chunk.delta_type === 'input_json_delta') {
        const newPartial = `${last._partialInput ?? ''}${chunk.partial_json ?? ''}`
        store.updateSubagentStreamBlock(sessionId, toolUseId, last.index, {
          ...last,
          _partialInput: newPartial,
          input: mergePartialToolInput(last.input, newPartial),
        })
      }
      return
    }
  }
}

export function cloneStreaming(sessionId: string, store: SessionStore) {
  return cloneStreamingBlocks(store.getStreaming(sessionId))
}

function cloneStreamingBlocks(blocks: StreamingBlock[]) {
  return blocks.map((block) => {
    if (block.type === 'text') return { ...block }
    if (block.type === 'thinking') return { ...block }
    return {
      ...block,
      input: { ...block.input },
      metadata: block.metadata ? { ...block.metadata } : undefined,
      _approval: block._approval ? { ...block._approval, toolInput: { ...block._approval.toolInput } } : undefined,
      _prompt: block._prompt
        ? {
            ...block._prompt,
            options: block._prompt.options?.map((option) => ({ ...option })),
            metadata: block._prompt.metadata ? { ...block._prompt.metadata } : undefined,
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
  }) as StreamingBlock[]
}

export function mergePartialToolInput(current: Record<string, unknown>, partialJSON: string) {
  const trimmed = partialJSON.trim()
  if (!trimmed) return current
  try {
    return { ...current, ...(JSON.parse(trimmed) as Record<string, unknown>) }
  } catch {
    return current
  }
}
