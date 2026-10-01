import type { StoreApi } from 'zustand'
import type { SessionState } from './sessionStoreTypes'

type PlanActions = Pick<SessionState, 'upsertPlan' | 'getPlan' | 'getSessionPlans' | 'getPendingPlan'>
type SessionSet = StoreApi<SessionState>['setState']
type SessionGet = StoreApi<SessionState>['getState']

export function createPlanActions(set: SessionSet, get: SessionGet): PlanActions {
  return {
    upsertPlan: (sessionId, plan) =>
      set((state) => ({
        sessions: state.sessions.map((session) => {
          if (session.id !== sessionId) return session
          const existing = session.plans ?? {}
          return { ...session, plans: { ...existing, [plan.id]: plan } }
        }),
      })),

    getPlan: (sessionId, planId) => {
      const session = get().sessions.find((item) => item.id === sessionId)
      return session?.plans?.[planId]
    },

    getSessionPlans: (sessionId) => {
      const session = get().sessions.find((item) => item.id === sessionId)
      return session?.plans ? Object.values(session.plans) : []
    },

    getPendingPlan: (sessionId) => {
      const session = get().sessions.find((item) => item.id === sessionId)
      if (!session?.plans) return undefined
      return Object.values(session.plans).find((plan) => plan.status === 'pending')
    },
  }
}
