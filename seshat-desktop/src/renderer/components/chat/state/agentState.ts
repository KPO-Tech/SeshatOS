import type { StoreApi } from 'zustand'
import type { SessionState } from './sessionStoreTypes'
import { defaultAgentState } from './sessionTypes'

type AgentActions = Pick<SessionState, 'getAgentState' | 'updateAgentState' | 'pushToolActivity' | 'resetAgentState'>
type SessionSet = StoreApi<SessionState>['setState']
type SessionGet = StoreApi<SessionState>['getState']

export function createAgentActions(set: SessionSet, get: SessionGet, defaultAgent = defaultAgentState()): AgentActions {
  return {
    getAgentState: (sessionId) => get().agentStates[sessionId] ?? defaultAgent,

    updateAgentState: (sessionId, patch) =>
      set((state) => ({
        agentStates: {
          ...state.agentStates,
          [sessionId]: { ...(state.agentStates[sessionId] ?? defaultAgent), ...patch },
        },
      })),

    pushToolActivity: (sessionId, activity) =>
      set((state) => {
        const current = state.agentStates[sessionId] ?? defaultAgent
        const log = [...current.activityLog, activity].slice(-50)
        return {
          agentStates: {
            ...state.agentStates,
            [sessionId]: { ...current, activityLog: log },
          },
        }
      }),

    resetAgentState: (sessionId) =>
      set((state) => ({
        agentStates: { ...state.agentStates, [sessionId]: defaultAgentState() },
      })),
  }
}
