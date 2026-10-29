import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import type { UserPreferences } from '@renderer/api/types'

/**
 * The person's preferences kept by the backend. A save replaces the whole record, so it sends back what is stored with
 * only the given fields changed.
 */
export function useUserPreferences() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.get<UserPreferences>('/users/me/preferences')
      .then((loaded) => {
        if (!cancelled) setPrefs(loaded)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the preferences')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(async (patch: Partial<UserPreferences>) => {
    setBusy(true)
    setError(null)
    try {
      const current = await api.get<UserPreferences>('/users/me/preferences')
      setPrefs(await api.put<UserPreferences>('/users/me/preferences', { ...current, ...patch }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the preferences')
    } finally {
      setBusy(false)
    }
  }, [])

  return { prefs, busy, error, save }
}
