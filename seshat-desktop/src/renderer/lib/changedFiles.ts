// The files the agent wrote or edited during a turn, for the list shown under its answer.

export type ChangedFile = {
  /** Path as the tool received it. */
  path: string
  name: string
  status: 'created' | 'modified'
  linesAdded: number
  linesRemoved: number
  /** The tool call that last touched it: what a click opens in the Files panel. */
  toolId: string
}

// Same tool names as the write and edit categories of components/chat/tools/toolDisplay.tsx.
const WRITE_TOOLS = new Set(['write', 'file_write', 'write_file'])
const EDIT_TOOLS = new Set(['edit', 'file_edit', 'edit_file'])

type ToolBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  _result?: { isError: boolean; metadata?: Record<string, unknown> }
}

type MessageLike = { role: string; content: ReadonlyArray<{ type: string }> }

function baseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

function isToolBlock(block: { type: string }): block is ToolBlock {
  return block.type === 'tool_use'
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** The files changed by the tool calls of these messages, in the order they were first touched, one entry per path. */
export function collectChangedFiles(messages: readonly MessageLike[]): ChangedFile[] {
  const files = new Map<string, ChangedFile>()
  for (const message of messages) {
    for (const block of message.content) {
      if (!isToolBlock(block)) continue
      const isWrite = WRITE_TOOLS.has(block.name)
      if (!isWrite && !EDIT_TOOLS.has(block.name)) continue
      // A call without a result is still running or never finished, and one with an error changed nothing.
      if (!block._result || block._result.isError) continue
      const path = typeof block.input.file_path === 'string' ? block.input.file_path : ''
      if (!path) continue
      const meta = block._result.metadata ?? {}
      const created = isWrite && meta.type === 'create'
      const previous = files.get(path)
      files.set(path, {
        path,
        name: baseName(path),
        // A file the agent created and then edited is still a file it created.
        status: previous?.status === 'created' || created ? 'created' : 'modified',
        linesAdded: (previous?.linesAdded ?? 0) + numberOf(meta.lines_added),
        linesRemoved: (previous?.linesRemoved ?? 0) + numberOf(meta.lines_removed),
        toolId: block.id
      })
    }
  }
  return [...files.values()]
}

/**
 * For each message that ends a turn (the last assistant message before the next user message, or the last one of the
 * list once nothing is streaming), the files changed during that whole turn. The key is the message index.
 */
export function changedFilesByTurnEnd(messages: readonly MessageLike[], streaming: boolean): Map<number, ChangedFile[]> {
  const result = new Map<number, ChangedFile[]>()
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
    const files = collectChangedFiles(messages.slice(turnStart + 1, i + 1))
    if (files.length > 0) result.set(i, files)
  }
  return result
}
