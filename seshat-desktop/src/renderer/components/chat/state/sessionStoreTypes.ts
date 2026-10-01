import type { Message, PlanDocument } from '@renderer/api/types'
import type { AgentState, ChatSession, StreamingBlock, SubagentState, ToolActivity } from './sessionTypes'

export type SessionState = {
  sessions: ChatSession[]
  activeId: string | null
  streamingBySession: Record<string, StreamingBlock[]>
  isStreamingBySession: Record<string, boolean>
  agentStates: Record<string, AgentState>

  setActive: (id: string | null) => void
  addSession: (session: ChatSession) => void
  upsertSession: (session: ChatSession) => void
  updateSession: (id: string, patch: Partial<ChatSession>) => void
  updateTitle: (id: string, title: string) => void
  addMessage: (sessionId: string, message: Message) => void
  updateMessage: (sessionId: string, messageId: string, updater: (message: Message) => Message) => void
  appendStreamBlock: (sessionId: string, block: StreamingBlock) => void
  getStreaming: (sessionId: string) => StreamingBlock[]
  setStreaming: (sessionId: string, blocks: StreamingBlock[]) => void
  updateStreamBlock: (sessionId: string, index: number, delta: Partial<StreamingBlock>) => void
  clearStreaming: (sessionId: string) => void
  isSessionStreaming: (sessionId: string) => boolean
  setIsStreaming: (sessionId: string, value: boolean) => void
  removeSession: (id: string) => void
  getActive: () => ChatSession | undefined
  resetAll: () => void

  getAgentState: (sessionId: string) => AgentState
  updateAgentState: (sessionId: string, patch: Partial<AgentState>) => void
  pushToolActivity: (sessionId: string, activity: ToolActivity) => void
  resetAgentState: (sessionId: string) => void

  upsertPlan: (sessionId: string, plan: PlanDocument) => void
  getPlan: (sessionId: string, planId: string) => PlanDocument | undefined
  getSessionPlans: (sessionId: string) => PlanDocument[]
  getPendingPlan: (sessionId: string) => PlanDocument | undefined

  subagentsBySession: Record<string, Record<string, SubagentState>>
  getSubagents: (sessionId: string) => SubagentState[]
  getSubagent: (sessionId: string, toolUseId: string) => SubagentState | undefined
  upsertSubagent: (sessionId: string, toolUseId: string, patch: Partial<SubagentState> & { agentType?: string; task?: string }) => void
  appendSubagentStreamBlock: (sessionId: string, toolUseId: string, block: StreamingBlock) => void
  updateSubagentStreamBlock: (sessionId: string, toolUseId: string, index: number, delta: Partial<StreamingBlock>) => void
  clearSubagentStreaming: (sessionId: string, toolUseId: string) => void
  pushSubagentToolActivity: (sessionId: string, toolUseId: string, activity: ToolActivity) => void
}
