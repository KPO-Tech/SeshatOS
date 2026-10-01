import { useEffect } from 'react'
import { api, ApiError } from '@renderer/api/client'
import { useAuthStore } from '@renderer/stores/auth'

const MAX_RETRIES = 5

// Confirms with the backend that the restored session is still valid.
// A real answer (401 or any other 4xx) ends the session; a network failure
// or 5xx is not a statement about the session — typically the local backend
// is still starting — so it retries with backoff and otherwise stays signed in.
export function useSessionValidation() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function check(attempt: number) {
      try {
        await api.get('/auth/me')
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status < 500) {
          useAuthStore.getState().logout()
          return
        }
        if (attempt >= MAX_RETRIES) return
        timer = setTimeout(() => void check(attempt + 1), Math.min(1000 * 2 ** attempt, 15000))
      }
    }

    void check(0)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [isAuthenticated])
}
