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
  // A creation whose result does not say which ids it made (a batch, usually):
  // the ids its updates name belong to these, in the order they were created.
  const unbound: string[] = []

  const bind = (id: string): PlanItem | undefined => {
    while (unbound.length > 0) {
      const pending = unbound.shift() as string
      const item = tasks.get(pending)
      if (!item) continue
      tasks.delete(pending)
      const at = order.indexOf(pending)
      if (at >= 0) order[at] = id
      item.id = id
      tasks.set(id, item)
      return item
    }
    return undefined
  }

  const add = (id: string, spec: Record<string, unknown>): void => {
    if (!tasks.has(id)) order.push(id)
    tasks.set(id, { id, title: titleOf(spec) || detailOf(spec) || '', detail: detailOf(spec), status: 'pending' })
  }

  for (const block of toolBlocks) {
    if (block.name === 'task_create') {
      if (block._status === 'failed') continue
      const specs = taskSpecs(block.input)
      const ids = createdIDs(block)
      specs.forEach((spec, index) => {
        const id = ids[index]
        if (id) {
          add(id, spec)
          return
        }
        const temporary = `create:${block.id}:${index}`
        add(temporary, spec)
        unbound.push(temporary)
      })
      continue
    }

    if (block.name !== 'task_update') continue

    for (const update of updateSpecs(block.input)) {
      const taskId = asString(update.taskId)
      if (!taskId) continue
      if (asString(update.status) === 'deleted') {
        tasks.delete(taskId)
        continue
      }

      const existing = tasks.get(taskId) ?? bind(taskId)
      if (!existing) order.push(taskId)

      const status = asString(update.status)
        ? mapTaskStatus(asString(update.status), block._status)
        : existing?.status ?? 'pending'

      tasks.set(taskId, {
        id: taskId,
        title: titleOf(update) || existing?.title || detailOf(update) || '',
        detail: detailOf(update) || existing?.detail,
        status,
      })
    }
  }

  const items = order.map((id) => tasks.get(id)).filter((item): item is PlanItem => Boolean(item))
  return summarizePlan('task', items)
}

// task_create takes a list in "tasks"; a single flat call is still read as one.
function taskSpecs(input: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const list = input?.tasks
  if (Array.isArray(list)) return list.filter(isRecord)
  return input ? [input] : []
}

// task_update takes a list in "updates", or one taskId with the fields to change.
function updateSpecs(input: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const list = input?.updates
  if (Array.isArray(list)) return list.filter(isRecord)
  return input ? [input] : []
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
// model fills whichever it knows: any of them names the task. A description is
// a detail, not a name, so it only stands in when the creation gave nothing else.
function titleOf(input: Record<string, unknown> | undefined): string {
  for (const key of ['subject', 'title', 'content', 'name']) {
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

// The ids a creation came back with, in creation order. A long id ends in its
// own counter, so the whole token is kept rather than its leading digits.
function createdIDs(block: ToolUseBlock): string[] {
  const content = block._result?.content ?? ''
  return [...content.matchAll(/Task #([\w.:-]+)/g)].map((match) => match[1])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
