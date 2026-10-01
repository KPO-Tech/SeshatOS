import { create } from 'zustand'
import { defaultAgentState, type StreamingBlock } from '@renderer/components/chat/state/sessionTypes'
import type { SessionState } from '@renderer/components/chat/state/sessionStoreTypes'
import { createAgentActions } from '@renderer/components/chat/state/agentState'
import { createPlanActions } from '@renderer/components/chat/state/planState'
import { createSessionCollectionActions } from '@renderer/components/chat/state/sessionCollectionState'
import { createStreamingActions } from '@renderer/components/chat/state/streamingState'
import { createSubagentActions } from '@renderer/components/chat/state/subagentState'
export type {
  AgentState,
  ChatAttachment,
  ChatSession,
  PendingPermission,
  StreamingBlock,
  SubagentState,
  ToolActivity,
} from '@renderer/components/chat/state/sessionTypes'
export { streamingToContentBlocks } from '@renderer/components/chat/state/streamingContent'

export const EMPTY_STREAMING: StreamingBlock[] = []
export const DEFAULT_AGENT_STATE = defaultAgentState()

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,
  streamingBySession: {},
  isStreamingBySession: {},
  agentStates: {},
  subagentsBySession: {},

  ...createSessionCollectionActions(set, get),
  ...createStreamingActions(set, get, EMPTY_STREAMING),
  ...createAgentActions(set, get, DEFAULT_AGENT_STATE),
  ...createPlanActions(set, get),
  ...createSubagentActions(set, get),
}))
