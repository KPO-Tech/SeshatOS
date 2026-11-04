import { api } from '@renderer/api/client'
import type { LoginRequest, LoginResponse, RegisterRequest } from '@renderer/api/types'
import { useAuthStore } from '@renderer/stores/auth'
import type { DevicePollStatus } from '@renderer/lib/deviceLogin'

export function useAuth() {
  const store = useAuthStore()

  async function login(credentials: LoginRequest) {
    if (window.seshat?.auth) {
      const session = await window.seshat.auth.login(credentials)
      store.setSession(session)
      return session.user
    }

    const res = await api.post<LoginResponse>('/auth/login', credentials)
    store.setSession({ user: res.user, roles: res.roles ?? [], isAuthenticated: true }, res.token)
    return res.user
  }

  async function register(payload: RegisterRequest) {
    if (window.seshat?.auth) {
      const session = await window.seshat.auth.register(payload)
      store.setSession(session)
      return session.user
    }

    const res = await api.post<LoginResponse>('/auth/register', payload)
    store.setSession({ user: res.user, roles: res.roles ?? [], isAuthenticated: true }, res.token)
    return res.user
  }

  async function continueWithoutAccount() {
    if (window.seshat?.auth) {
      const session = await window.seshat.auth.continueWithoutAccount()
      store.setSession(session)
      return session.user
    }

    const res = await api.post<LoginResponse>('/auth/local-session')
    store.setSession({ user: res.user, roles: res.roles ?? [], isAuthenticated: true }, res.token)
    return res.user
  }

  // Sign in by code (connected installs): the person approves a short code in their browser.
  async function deviceStart() {
    if (!window.seshat?.auth) throw new Error('Sign-in by code needs the desktop app.')
    return window.seshat.auth.deviceStart()
  }

  async function devicePoll(): Promise<DevicePollStatus> {
    if (!window.seshat?.auth) throw new Error('Sign-in by code needs the desktop app.')
    const answer = await window.seshat.auth.devicePoll()
    if (answer.status === 'approved') store.setSession(answer.session)
    return answer.status
  }

  async function deviceCancel() {
    await window.seshat?.auth?.deviceCancel()
  }

  async function restoreSession() {
    try {
      const session = await window.seshat?.auth?.restoreSession()
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
      if (window.seshat?.auth) {
        await window.seshat.auth.logout()
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
    deviceStart,
    devicePoll,
    deviceCancel,
    restoreSession
  }
}
