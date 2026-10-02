import type { Message, RAGSearchResult, StreamEvent, TokenUsage } from '@renderer/api/types'

export type RuntimeEventPayload = {
  type: string
  agent_tool_use_id?: string
  turn_number?: number
  execution_mode?: string
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
  chunk?: StreamEvent
  tool_progress?: {
    tool_name: string
    tool_use_id?: string
    stage: 'pending' | 'running' | 'completed' | 'failed'
    message?: string
    percent_complete?: number
    metadata?: Record<string, unknown>
  }
  permission_request?: {
    tool_use_id: string
    tool_name: string
    tool_input?: Record<string, unknown>
    description?: string
  }
  prompt_request?: {
    type: 'choice' | 'text' | 'confirm'
    message: string
    options?: Array<{ label: string; value: unknown; description?: string }>
    default?: unknown
    metadata?: Record<string, unknown>
  }
  plan_event?: {
    plan_id: string
    slug: string
    filename: string
    status: string
    version: number
  }
  agent_event?: {
    call_id: string
    agent_id: string
    agent_nickname?: string
    agent_role?: string
    status?: string
  }
  stage_event?: {
    stage: string
    label: string
  }
  compaction_event?: {
    pre_compact_tokens: number
    post_compact_tokens: number
  }
  error?: string
}

export type DonePayload = {
  messages?: Message[]
  tool_results?: Array<{ id: string; content: string; is_error?: boolean; duration_ms?: number; metadata?: Record<string, unknown> }>
  rag_results?: RAGSearchResult[]
  stop_reason?: string
  turn_number?: number
  usage?: TokenUsage
}

export type SessionTitledPayload = {
  session_id?: string
  title?: string
  // Derived from the prompt as a last resort; a generated title may still replace it.
  provisional?: boolean
}
