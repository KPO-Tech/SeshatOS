import type { PlanDocument, PlanStatus, ToolApproval, ToolPromptRequest, ToolRenderResult, ToolStatus } from '@renderer/api/types'
import type { RuntimeEventPayload } from '@renderer/components/chat/streaming/runtimeTypes'
import { cloneStreaming } from '@renderer/components/chat/streaming/streamReducers'
import { useSessionStore } from '@renderer/stores/session'

type SessionStore = ReturnType<typeof useSessionStore.getState>
type AgentState = ReturnType<SessionStore['getAgentState']>

export function updateStreamingTool(
  sessionId: string,
  store: SessionStore,
  toolUseId: string,
  patch: Partial<ReturnType<typeof cloneStreaming>[number]>,
) {
  const streaming = cloneStreaming(sessionId, store)
  for (const block of streaming) {
    if (block.type !== 'tool_use' || block.id !== toolUseId) continue
    Object.assign(block, patch)
  }
  store.setStreaming(sessionId, streaming)
}

export function ensureStreamingTool(
  sessionId: string,
  store: SessionStore,
  tool: {
    toolUseId: string
    toolName: string
    input?: Record<string, unknown>
    status?: ToolStatus
    approval?: ToolApproval
    prompt?: ToolPromptRequest
    message?: string
  },
) {
  if (!tool.toolUseId || findStreamingToolById(sessionId, store, tool.toolUseId)) {
    return
  }

  const streaming = cloneStreaming(sessionId, store)
  streaming.push({
    type: 'tool_use',
    index: streaming.length,
    id: tool.toolUseId,
    name: tool.toolName,
    input: { ...tool.input },
    _status: tool.status ?? 'pending',
    _approval: tool.approval,
    _prompt: tool.prompt,
    _result: undefined,
    _partialInput: '',
    _message: tool.message,
  })
  store.setStreaming(sessionId, streaming)
}

export function markLatestStreamingTool(
  sessionId: string,
  store: SessionStore,
  toolName: string | null,
  status: ToolStatus,
) {
  const streaming = cloneStreaming(sessionId, store)
  for (let index = streaming.length - 1; index >= 0; index--) {
    const block = streaming[index]
    if (block.type !== 'tool_use') continue
    if (toolName && block.name !== toolName) continue
    block._status = status
    break
  }
  store.setStreaming(sessionId, streaming)
}

export function findStreamingToolById(
  sessionId: string,
  store: SessionStore,
  toolUseId: string,
) {
  for (const block of store.getStreaming(sessionId)) {
    if (block.type === 'tool_use' && block.id === toolUseId) {
      return block
    }
  }
  return null
}

export function findLatestStreamingToolUseByName(
  sessionId: string,
  store: SessionStore,
  toolName: string,
) {
  const streaming = store.getStreaming(sessionId)
  for (let index = streaming.length - 1; index >= 0; index -= 1) {
    const block = streaming[index]
    if (block.type === 'tool_use' && block.name === toolName) {
      return block
    }
  }
  return null
}

export function toolResultFromProgress(
  progress: NonNullable<RuntimeEventPayload['tool_progress']>,
): ToolRenderResult | undefined {
  const metadata = progress.metadata
  if (!metadata) return undefined
  if (progress.stage !== 'completed' && progress.stage !== 'failed') return undefined

  const content = typeof metadata.content === 'string'
    ? metadata.content
    : typeof progress.message === 'string'
      ? progress.message
      : ''

  const durationMs = typeof metadata.execution_duration_ms === 'number'
    ? metadata.execution_duration_ms
    : undefined

  return {
    content,
    isError: progress.stage === 'failed',
    durationMs,
    metadata: { ...metadata },
  }
}

export function toolInputFromProgress(
  progress: NonNullable<RuntimeEventPayload['tool_progress']>,
): Record<string, unknown> {
  const raw = progress.metadata?.tool_input
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  return { ...(raw as Record<string, unknown>) }
}

export function normaliseMode(raw?: string): AgentState['executionMode'] {
  if (raw === 'plan' || raw === 'pair_programming') return raw
  return 'execute'
}

export async function fetchPlanContent(
  sessionId: string,
  planId: string,
  store: SessionStore,
) {
  try {
    const { api } = await import('@renderer/api/client')
    const plan = await api.get<PlanDocument>(`/plans/${planId}`)
    store.upsertPlan(sessionId, plan)
  } catch {
    // Best-effort prefetch; PlanEditorPanel can retry and surface errors.
  }
}

export function seedPlanFromRuntimeEvent(
  sessionId: string,
  planEvent: NonNullable<RuntimeEventPayload['plan_event']>,
): PlanDocument {
  return {
    id: planEvent.plan_id,
    session_id: sessionId,
    slug: planEvent.slug,
    filename: planEvent.filename,
    content: '',
    status: planEvent.status as PlanStatus,
    version: planEvent.version,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  }
}
