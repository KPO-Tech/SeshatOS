import type { StoreApi } from 'zustand'
import type { SessionState } from './sessionStoreTypes'
import type { AgentState, SubagentState } from './sessionTypes'

type SessionCollectionActions = Pick<
  SessionState,
  | 'setActive'
  | 'addSession'
  | 'upsertSession'
  | 'updateSession'
  | 'updateTitle'
  | 'addMessage'
  | 'updateMessage'
  | 'removeSession'
  | 'getActive'
  | 'resetAll'
>
type SessionSet = StoreApi<SessionState>['setState']
type SessionGet = StoreApi<SessionState>['getState']

export function createSessionCollectionActions(set: SessionSet, get: SessionGet): SessionCollectionActions {
  return {
    setActive: (id) => set({ activeId: id }),

    addSession: (session) =>
      set((state) => ({ sessions: [session, ...state.sessions], activeId: session.id })),

    upsertSession: (session) =>
      set((state) => {
        const existing = state.sessions.find((item) => item.id === session.id)
        if (!existing) {
          return { sessions: [session, ...state.sessions] }
        }
        return {
          sessions: state.sessions.map((item) => (item.id === session.id ? { ...item, ...session } : item)),
        }
      }),

    updateSession: (id, patch) =>
      set((state) => ({
        sessions: state.sessions.map((session) => (session.id === id ? { ...session, ...patch } : session)),
      })),

    updateTitle: (id, title) =>
      set((state) => ({
        sessions: state.sessions.map((session) => (session.id === id ? { ...session, title } : session)),
      })),

    addMessage: (sessionId, message) =>
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === sessionId ? { ...session, messages: [...session.messages, message] } : session
        ),
      })),

    updateMessage: (sessionId, messageId, updater) =>
      set((state) => ({
        sessions: state.sessions.map((session) => {
          if (session.id !== sessionId) return session
          return {
            ...session,
            messages: session.messages.map((message) => (message.id === messageId ? updater(message) : message)),
          }
        }),
      })),

    removeSession: (id) =>
      set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== id),
        activeId: state.activeId === id ? null : state.activeId,
        streamingBySession: Object.fromEntries(
          Object.entries(state.streamingBySession).filter(([sessionId]) => sessionId !== id),
        ),
        isStreamingBySession: Object.fromEntries(
          Object.entries(state.isStreamingBySession).filter(([sessionId]) => sessionId !== id),
        ),
        agentStates: Object.fromEntries(
          Object.entries(state.agentStates).filter(([sessionId]) => sessionId !== id),
        ) as Record<string, AgentState>,
        subagentsBySession: Object.fromEntries(
          Object.entries(state.subagentsBySession).filter(([sessionId]) => sessionId !== id),
        ) as Record<string, Record<string, SubagentState>>,
      })),

    getActive: () => {
      const { sessions, activeId } = get()
      return sessions.find((session) => session.id === activeId)
    },

    resetAll: () =>
      set({
        sessions: [],
        activeId: null,
        streamingBySession: {},
        isStreamingBySession: {},
        agentStates: {},
        subagentsBySession: {},
      }),
  }
}
