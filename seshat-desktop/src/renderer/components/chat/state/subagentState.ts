import type { StoreApi } from 'zustand'
import type { SessionState } from './sessionStoreTypes'
import type { StreamingBlock, SubagentState } from './sessionTypes'

type SubagentActions = Pick<
  SessionState,
  | 'getSubagents'
  | 'getSubagent'
  | 'upsertSubagent'
  | 'appendSubagentStreamBlock'
  | 'updateSubagentStreamBlock'
  | 'clearSubagentStreaming'
  | 'pushSubagentToolActivity'
>
type SessionSet = StoreApi<SessionState>['setState']
type SessionGet = StoreApi<SessionState>['getState']

export function createSubagentActions(set: SessionSet, get: SessionGet): SubagentActions {
  return {
    getSubagents: (sessionId) => {
      const byId = get().subagentsBySession[sessionId]
      return byId ? Object.values(byId) : []
    },

    getSubagent: (sessionId, toolUseId) => get().subagentsBySession[sessionId]?.[toolUseId],

    upsertSubagent: (sessionId, toolUseId, patch) =>
      set((state) => {
        const byId = state.subagentsBySession[sessionId] ?? {}
        const existing = byId[toolUseId]
        const next: SubagentState = existing
          ? { ...existing, ...patch }
          : {
              toolUseId,
              agentType: patch.agentType ?? 'agent',
              task: patch.task ?? '',
              status: patch.status ?? 'running',
              streaming: [],
              messages: [],
              turnNumber: 0,
              inputTokens: 0,
              outputTokens: 0,
              activeTool: null,
              activityLog: [],
              isThinking: false,
              startedAt: Date.now(),
              ...patch,
            }
        return {
          subagentsBySession: {
            ...state.subagentsBySession,
            [sessionId]: { ...byId, [toolUseId]: next },
          },
        }
      }),

    appendSubagentStreamBlock: (sessionId, toolUseId, block) =>
      set((state) => {
        const byId = state.subagentsBySession[sessionId] ?? {}
        const existing = byId[toolUseId]
        if (!existing) return state
        return {
          subagentsBySession: {
            ...state.subagentsBySession,
            [sessionId]: {
              ...byId,
              [toolUseId]: { ...existing, streaming: [...existing.streaming, block] },
            },
          },
        }
      }),

    updateSubagentStreamBlock: (sessionId, toolUseId, index, delta) =>
      set((state) => {
        const byId = state.subagentsBySession[sessionId] ?? {}
        const existing = byId[toolUseId]
        if (!existing) return state
        return {
          subagentsBySession: {
            ...state.subagentsBySession,
            [sessionId]: {
              ...byId,
              [toolUseId]: {
                ...existing,
                streaming: existing.streaming.map((block) =>
                  block.index === index ? ({ ...block, ...delta } as StreamingBlock) : block
                ),
              },
            },
          },
        }
      }),

    clearSubagentStreaming: (sessionId, toolUseId) =>
      set((state) => {
        const byId = state.subagentsBySession[sessionId] ?? {}
        const existing = byId[toolUseId]
        if (!existing) return state
        return {
          subagentsBySession: {
            ...state.subagentsBySession,
            [sessionId]: { ...byId, [toolUseId]: { ...existing, streaming: [] } },
          },
        }
      }),

    pushSubagentToolActivity: (sessionId, toolUseId, activity) =>
      set((state) => {
        const byId = state.subagentsBySession[sessionId] ?? {}
        const existing = byId[toolUseId]
        if (!existing) return state
        const log = [...existing.activityLog, activity].slice(-50)
        return {
          subagentsBySession: {
            ...state.subagentsBySession,
            [sessionId]: { ...byId, [toolUseId]: { ...existing, activityLog: log } },
          },
        }
      }),
  }
}
