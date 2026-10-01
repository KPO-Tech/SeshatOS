import type { Message, PlanDocument, ToolApproval, ToolPromptRequest } from '@renderer/api/types'
import type { ChatAttachment } from '@renderer/components/chat/attachments/attachmentTypes'

export type { ChatAttachment }

export type ChatSession = {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt?: string
  providerSettingId?: string
  providerLabel?: string
  modelId?: string
  modelLabel?: string
  permissionMode?: string
  executionOrigin?: string
  source?: string
  workspacePath?: string
  projectPath?: string
  draftPrompt?: string
  draftAgentSlug?: string
  draftFileIds?: string[]
  draftAttachments?: ChatAttachment[]
  planArtifact?: string
  plans?: Record<string, PlanDocument>
}

export type StreamingBlock =
  | { type: 'text'; index: number; text: string }
  | { type: 'thinking'; index: number; thinking: string }
  | {
      type: 'tool_use'
      index: number
      id: string
      name: string
      input: Record<string, unknown>
      metadata?: Record<string, unknown>
      _status?: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed'
      _result?: { content: string; isError: boolean; durationMs?: number; metadata?: Record<string, unknown> }
      _approval?: ToolApproval
      _prompt?: ToolPromptRequest
      _partialInput?: string
      _message?: string
    }

export type ToolActivity = {
  toolName: string
  stage: 'pending' | 'running' | 'completed' | 'failed'
  message?: string
  startedAt: number
  endedAt?: number
}

export type PendingPermission = ToolApproval

export type SubagentState = {
  toolUseId: string
  agentId?: string
  agentType: string
  task: string
  status: 'running' | 'completed' | 'failed'
  streaming: StreamingBlock[]
  messages: Message[]
  turnNumber: number
  inputTokens: number
  outputTokens: number
  activeTool: ToolActivity | null
  activityLog: ToolActivity[]
  isThinking: boolean
  startedAt: number
  endedAt?: number
  error?: string
  result?: string
}

export type AgentState = {
  executionMode: 'execute' | 'plan' | 'pair_programming'
  turnNumber: number
  inputTokens: number
  outputTokens: number
  activeTool: ToolActivity | null
  activityLog: ToolActivity[]
  isThinking: boolean
  pendingPermission: PendingPermission | null
  stage: { stage: string; label: string } | null
}

export function defaultAgentState(): AgentState {
  return {
    executionMode: 'execute',
    turnNumber: 0,
    inputTokens: 0,
    outputTokens: 0,
    activeTool: null,
    activityLog: [],
    isThinking: false,
    pendingPermission: null,
    stage: null,
  }
}
