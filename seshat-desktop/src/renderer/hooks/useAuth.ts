import { api } from '@renderer/api/client'
import type { LoginRequest, LoginResponse, RegisterRequest } from '@renderer/api/types'
import { useAuthStore } from '@renderer/stores/auth'

export function useAuth() {
  const store = useAuthStore()

  async function login(credentials: LoginRequest) {
    if (window.nexus?.auth) {
      const session = await window.nexus.auth.login(credentials)
      store.setSession(session)
      return session.user
    }

    const res = await api.post<LoginResponse>('/auth/login', credentials)
    store.setSession({ user: res.user, roles: res.roles ?? [], isAuthenticated: true }, res.token)
    return res.user
  }

  async function register(payload: RegisterRequest) {
    if (window.nexus?.auth) {
      const session = await window.nexus.auth.register(payload)
      store.setSession(session)
      return session.user
    }

    const res = await api.post<LoginResponse>('/auth/register', payload)
    store.setSession({ user: res.user, roles: res.roles ?? [], isAuthenticated: true }, res.token)
    return res.user
  }

  async function continueWithoutAccount() {
    if (window.nexus?.auth) {
      const session = await window.nexus.auth.continueWithoutAccount()
      store.setSession(session)
      return session.user
    }

    const res = await api.post<LoginResponse>('/auth/local-session')
    store.setSession({ user: res.user, roles: res.roles ?? [], isAuthenticated: true }, res.token)
    return res.user
  }

  async function restoreSession() {
    try {
      const session = await window.nexus?.auth?.restoreSession()
      if (session) {
        store.setSession(session)
        return
      }
    } finally {
      store.setRestoring(false)
    }
  }

  async function logout() {
    try {
      if (window.nexus?.auth) {
        await window.nexus.auth.logout()
      } else {
        await api.post('/auth/logout')
      }
    } catch {
      // best-effort
    } finally {
      store.logout()
    }
  }

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    restoring: store.restoring,
    login,
    logout,
    register,
    continueWithoutAccount,
    restoreSession
  }
}
