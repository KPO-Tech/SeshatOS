import type { Message, ToolStatus, ToolUseBlock } from '@renderer/api/types'
import type { StreamingBlock } from '@renderer/stores/session'
import { streamingToContentBlocks } from '@renderer/stores/session'

type PlanItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

type PlanItem = {
  id: string
  /** What the task says. Empty when the engine never named it: the panel has a word for that. */
  title: string
  detail?: string
  status: PlanItemStatus
}

type PlanSnapshot = {
  source: 'task' | null
  items: PlanItem[]
  completedCount: number
  activeCount: number
}

export function derivePlanSnapshot(messages: Message[], streaming: StreamingBlock[] = []): PlanSnapshot {
  const toolBlocks = collectToolBlocks(messages, streaming)
  return deriveTaskSnapshot(toolBlocks)
}

function collectToolBlocks(messages: Message[], streaming: StreamingBlock[]): ToolUseBlock[] {
  const blocks: ToolUseBlock[] = []

  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'tool_use') blocks.push(block)
    }
  }

  for (const block of streamingToContentBlocks(streaming)) {
    if (block.type === 'tool_use') blocks.push(block)
  }

  return blocks
}

function deriveTaskSnapshot(toolBlocks: ToolUseBlock[]): PlanSnapshot {
  const tasks = new Map<string, PlanItem>()
  const order: string[] = []
  // A creation whose result does not name the task it made: the first update
  // that names a task nobody knows yet is that task, instead of a new row
  // beside it (which is how one task read as "Untitled task" plus a row
  // titled with its raw id).
  let unbound: string | null = null

  const bind = (id: string): PlanItem | undefined => {
    const pending = unbound
    if (!pending) return undefined
    const item = tasks.get(pending)
    if (!item) {
      unbound = null
      return undefined
    }
    tasks.delete(pending)
    const at = order.indexOf(pending)
    if (at >= 0) order[at] = id
    item.id = id
    tasks.set(id, item)
    unbound = null
    return item
  }

  for (const block of toolBlocks) {
    if (block.name === 'task_create') {
      if (block._status === 'failed') continue
      const createdId = parseCreatedTaskID(block)
      const id = createdId || `create:${block.id}`
      if (!createdId) unbound = id
      if (!tasks.has(id)) order.push(id)
      tasks.set(id, { id, title: titleOf(block.input), detail: detailOf(block.input), status: 'pending' })
      continue
    }

    if (block.name === 'task_update') {
      const taskId = asString(block.input?.taskId)
      if (!taskId) continue
      if (asString(block.input?.status) === 'deleted') {
        tasks.delete(taskId)
        continue
      }

      const existing = tasks.get(taskId) ?? bind(taskId)
      const title = titleOf(block.input) || existing?.title || ''
      const detail = detailOf(block.input) || existing?.detail

      if (!existing) order.push(taskId)

      tasks.set(taskId, { id: taskId, title, detail, status: mapTaskStatus(asString(block.input?.status), block._status) })
    }
  }

  const items = order.map((id) => tasks.get(id)).filter((item): item is PlanItem => Boolean(item))
  return summarizePlan('task', items)
}

function summarizePlan(source: PlanSnapshot['source'], items: PlanItem[]): PlanSnapshot {
  return {
    source,
    items,
    completedCount: items.filter((item) => item.status === 'completed').length,
    activeCount: items.filter((item) => item.status === 'in_progress').length,
  }
}

function mapTaskStatus(status: string, toolStatus?: ToolStatus): PlanItemStatus {
  if (status === 'completed') return 'completed'
  if (status === 'in_progress') return 'in_progress'
  if (toolStatus === 'failed') return 'failed'
  return 'pending'
}

// The engine names the field differently from one version to the next, and the
// model fills whichever it knows: any of them reads as the title.
function titleOf(input: Record<string, unknown> | undefined): string {
  for (const key of ['subject', 'title', 'content', 'name', 'description', 'activeForm']) {
    const value = asString(input?.[key]).trim()
    if (value) return firstLine(value)
  }
  return ''
}

function detailOf(input: Record<string, unknown> | undefined): string | undefined {
  for (const key of ['activeForm', 'description', 'detail']) {
    const value = asString(input?.[key]).trim()
    if (value) return firstLine(value)
  }
  return undefined
}

function firstLine(value: string): string {
  const line = value.split('\n')[0]?.trim() ?? ''
  return line.length > 140 ? `${line.slice(0, 140)}...` : line
}

// The id a creation came back with: a long id ending in its own counter, so the
// whole token is kept rather than its leading digits.
function parseCreatedTaskID(block: ToolUseBlock): string {
  const content = block._result?.content ?? ''
  const match = content.match(/Task #([\w.:-]+)/)
  return match?.[1] ?? ''
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
