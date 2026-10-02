import { useEffect, useCallback } from 'react'
import { api } from '@renderer/api/client'
import { useProvidersStore } from '@renderer/stores/providers'
import { useAuthStore } from '@renderer/stores/auth'
import type { ProviderSetting, ProviderModel, OAuthChallenge } from '@renderer/api/types'

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

export async function syncProviderModels(settingId: string): Promise<ProviderModel[]> {
  const data = await api.post<{ models: ProviderModel[]; count: number; synced: boolean }>(
    `/settings/providers/${settingId}/models/sync`
  )
  return data?.models ?? []
}

export async function addProviderSetting(params: {
  provider: string
  name: string
  auth_kind: string
  api_key?: string
  base_url?: string
}): Promise<ProviderSetting> {
  return api.post('/settings/providers', params)
}

export async function deleteProviderSetting(id: string): Promise<void> {
  return api.delete(`/settings/providers/${id}`)
}

export async function setProviderDefault(id: string): Promise<ProviderSetting> {
  return api.post<ProviderSetting>(`/settings/providers/${id}/set-default`, {})
}

export async function addCustomModel(
  settingId: string,
  params: {
    model_id: string
    display_name?: string
    context_window?: number
    max_output?: number
    is_default?: boolean
  }
): Promise<ProviderModel> {
  return api.post(`/settings/providers/${settingId}/models`, params)
}

export async function startProviderOAuth(settingId: string): Promise<OAuthChallenge> {
  return api.post(`/settings/providers/${settingId}/oauth/start`, {})
}

export async function pollProviderOAuth(settingId: string): Promise<ProviderSetting> {
  return api.post(`/settings/providers/${settingId}/oauth/poll`, {})
}

export async function disconnectProviderOAuth(settingId: string): Promise<void> {
  return api.delete(`/settings/providers/${settingId}/oauth`)
}
