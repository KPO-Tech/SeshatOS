import type { Message, ToolStatus, ToolUseBlock } from '@renderer/api/types'
import type { StreamingBlock } from '@renderer/stores/session'
import { streamingToContentBlocks } from '@renderer/stores/session'

export type PlanItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type PlanItem = {
  id: string
  title: string
  detail?: string
  status: PlanItemStatus
}

export type PlanSnapshot = {
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

  for (const block of toolBlocks) {
    if (block.name === 'task_create') {
      if (block._status === 'failed') continue

      const id = parseCreatedTaskID(block) || block.id
      const title = asString(block.input?.subject) || 'Untitled task'
      const detail = asString(block.input?.activeForm) || asString(block.input?.description) || undefined

      if (!tasks.has(id)) {
        order.push(id)
      }
      tasks.set(id, {
        id,
        title,
        detail,
        status: 'pending',
      })
      continue
    }

    if (block.name === 'task_update') {
      const taskId = asString(block.input?.taskId)
      if (!taskId) continue
      if (asString(block.input?.status) === 'deleted') {
        tasks.delete(taskId)
        continue
      }

      const existing = tasks.get(taskId)
      const title = asString(block.input?.subject) || existing?.title || `Task #${taskId}`
      const detail =
        asString(block.input?.activeForm)
        || asString(block.input?.description)
        || existing?.detail
        || undefined
      const status = mapTaskStatus(asString(block.input?.status), block._status)

      if (!existing) {
        order.push(taskId)
      }

      tasks.set(taskId, {
        id: taskId,
        title,
        detail,
        status,
      })
    }
  }

  const items = order
    .map((id) => tasks.get(id))
    .filter((item): item is PlanItem => Boolean(item))

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

function parseCreatedTaskID(block: ToolUseBlock): string {
  const content = block._result?.content ?? ''
  const match = content.match(/Task #(\d+) created successfully/)
  return match?.[1] ?? ''
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
