import { useRef } from 'react'
import { useSessionStore, type StreamingBlock } from '@renderer/stores/session'

type ToolBlock = Extract<StreamingBlock, { type: 'tool_use' }>

function toolBlocks(blocks: StreamingBlock[] | undefined): ToolBlock[] {
  if (!blocks) return []
  return blocks.filter((block): block is ToolBlock => block.type === 'tool_use')
}

// The same call in the same state. A call whose input is still being written changes at each token (input and _partialInput): that is
// not a change for a panel, which reads a call's input once the call runs, by when its status has moved on.
function sameCall(a: ToolBlock, b: ToolBlock): boolean {
  if (a === b) return true
  return a.id === b.id && a.name === b.name && a._status === b._status && a._result === b._result && a._approval === b._approval && a._prompt === b._prompt && a._message === b._message
}

function sameCalls(a: ToolBlock[], b: ToolBlock[]): boolean {
  return a.length === b.length && a.every((call, index) => sameCall(call, b[index]))
}

/**
 * The tool calls of the turn being streamed, without its text. A panel that lists or follows tools reads this instead of every streaming
 * block: the text changes with each token, a tool call only when it starts, runs or ends, and the list stays the same object while
 * nothing of that changes (see sameCall), so the panel is not drawn again for each token.
 */
export function useStreamingTools(sessionId: string | undefined): ToolBlock[] {
  const last = useRef<ToolBlock[]>([])
  return useSessionStore((state) => {
    const next = toolBlocks(sessionId ? state.streamingBySession[sessionId] : undefined)
    if (sameCalls(last.current, next)) return last.current
    last.current = next
    return next
  })
}
