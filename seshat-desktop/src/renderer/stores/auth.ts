import { create } from 'zustand'
import type { AuthSession, User } from '@renderer/api/types'
import { useSessionStore } from './session'

type AuthState = {
  token: string | null
  user: User | null
  roles: string[]
  isAuthenticated: boolean
  restoring: boolean
  setRestoring: (restoring: boolean) => void
  setSession: (session: AuthSession, token?: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  user: null,
  roles: [],
  isAuthenticated: false,
  restoring: true,
  setRestoring: (restoring) => set({ restoring }),
  setSession: (session, token = null) => {
    // A different account's data must never carry over into this session.
    if (get().user && get().user?.id !== session.user.id) useSessionStore.getState().resetAll()
    set({
      token,
      user: session.user,
      roles: session.roles ?? [],
      isAuthenticated: session.isAuthenticated,
      restoring: false
    })
  },
  logout: () => {
    if (typeof window !== 'undefined' && window.nexus?.auth) {
      void window.nexus.auth.clearSession().catch(() => {
        // best-effort
      })
    }
    useSessionStore.getState().resetAll()
    set({ token: null, user: null, roles: [], isAuthenticated: false, restoring: false })
  }
}))
