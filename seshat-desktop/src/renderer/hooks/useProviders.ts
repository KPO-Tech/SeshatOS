import { useEffect, useCallback } from 'react'
import { api } from '@renderer/api/client'
import { useProvidersStore } from '@renderer/stores/providers'
import { useAuthStore } from '@renderer/stores/auth'
import type { ProviderSetting, ProviderModel } from '@renderer/api/types'

export function useProviders() {
  const setProviders = useProvidersStore((s) => s.setProviders)
  const setLoading = useProvidersStore((s) => s.setLoading)
  const loading = useProvidersStore((s) => s.loading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const fetch = useCallback(async () => {
    if (!isAuthenticated) return
    setLoading(true)
    try {
      const data = await api.get<{ settings: ProviderSetting[]; count: number }>('/settings/providers')
      setProviders(data?.settings ?? [])
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, setProviders, setLoading])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { loading, refetch: fetch }
}

// Re-reads the provider list into the shared store and invalidates cached
// model lists. The Config UI manages providers through its own API layer, so
// without this Home and open conversations kept whatever list existed when
// they first mounted - a provider added in Config never showed up in the
// model picker until the app restarted.
export async function refreshProviders(): Promise<void> {
  const store = useProvidersStore.getState()
  try {
    const data = await api.get<{ settings: ProviderSetting[]; count: number }>('/settings/providers')
    store.setProviders(data?.settings ?? [])
  } catch {
    // Keep the current list; the next change or mount tries again.
  } finally {
    store.bumpVersion()
  }
}

export async function fetchProviderModels(settingId: string): Promise<ProviderModel[]> {
  const data = await api.get<{ models: ProviderModel[]; count: number }>(
    `/settings/providers/${settingId}/models`
  )
  return data?.models ?? []
}

