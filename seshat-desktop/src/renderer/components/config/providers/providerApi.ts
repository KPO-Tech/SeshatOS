import { api } from '@renderer/api/client'
import { refreshProviders } from '@renderer/hooks/useProviders'
import type { ProviderCatalogEntry, ProviderModel, ProviderOAuthChallenge, ProviderSetting } from './providerTypes'

// Every mutation below ends here so the rest of the app (model picker in Home
// and conversations) sees the change without a restart.
function afterChange<T>(result: T): T {
  void refreshProviders()
  return result
}

export async function fetchProviderCatalog() {
  const result = await api.get<{ providers: ProviderCatalogEntry[]; count: number }>('/models')
  return result.providers ?? []
}

export async function fetchProviderSettings() {
  const result = await api.get<{ settings: ProviderSetting[]; count: number }>('/settings/providers')
  return result.settings ?? []
}

export async function createProviderSetting(params: {
  provider: string
  name: string
  auth_kind: string
  api_key?: string
  base_url?: string
}) {
  return api.post<ProviderSetting>('/settings/providers', params).then(afterChange)
}

export async function fetchProviderModels(settingId: string) {
  const result = await api.get<{ models: ProviderModel[]; count: number }>(`/settings/providers/${settingId}/models`)
  return result.models ?? []
}

export async function syncProviderModels(settingId: string) {
  const result = await api.post<{ models: ProviderModel[]; count: number; synced: boolean }>(`/settings/providers/${settingId}/models/sync`, {})
  afterChange(null)
  return result.models ?? []
}

export function setDefaultProvider(settingId: string) {
  return api.post<ProviderSetting>(`/settings/providers/${settingId}/set-default`, {}).then(afterChange)
}

export function updateProviderSetting(settingId: string, params: {
  name?: string
  auth_kind?: string
  api_key?: string
  base_url?: string
  model_id?: string
}) {
  return api.put<ProviderSetting>(`/settings/providers/${settingId}`, params).then(afterChange)
}

export function deleteProviderSetting(settingId: string) {
  return api.delete(`/settings/providers/${settingId}`).then(afterChange)
}

export function createProviderModel(settingId: string, params: {
  model_id: string
  display_name?: string
  context_window?: number
  max_output?: number
  is_default?: boolean
}) {
  return api.post<ProviderModel>(`/settings/providers/${settingId}/models`, params).then(afterChange)
}

export function startProviderOAuth(settingId: string) {
  return api.post<ProviderOAuthChallenge>(`/settings/providers/${settingId}/oauth/start`, {})
}

export function pollProviderOAuth(settingId: string) {
  return api.post<ProviderSetting>(`/settings/providers/${settingId}/oauth/poll`, {}).then(afterChange)
}

export function disconnectProviderOAuth(settingId: string) {
  return api.delete<ProviderSetting>(`/settings/providers/${settingId}/oauth`).then(afterChange)
}

export function fetchSystemStatus() {
  return api.get<{ mode: 'standalone' | 'connected'; server_url?: string }>('/system/status')
}
