import { api } from '@renderer/api/client'
import type { DomainCategory, SearchProviderConfig, WebSearchSettings } from './webSearchTypes'

export async function fetchWebSearchSettings() {
  return api.get<WebSearchSettings>('/web/search/settings')
}

export async function updateWebSearchSettings(params: {
  enabled: boolean
  provider_setting_ids: string[]
  allow_env_fallback: boolean
  allowed_domains: string[]
  blocked_domains: string[]
  max_queries_per_day: number
}) {
  return api.put<WebSearchSettings>('/web/search/settings', params)
}

export async function fetchSearchProviders() {
  const result = await api.get<{ providers: SearchProviderConfig[]; count: number }>('/web/search/providers')
  return (result.providers ?? []).sort((a, b) => a.priority - b.priority)
}

export function updateSearchProvider(provider: string, params: {
  enabled: boolean
  api_key?: string
  base_url?: string
  auth_username?: string
}) {
  return api.put<SearchProviderConfig>(`/web/search/providers/${provider}`, params)
}

export function testSearchProvider(provider: string) {
  return api.post<{ ok: boolean; latency_ms: number; error: string }>(`/web/search/providers/${provider}/test`, {})
}

export async function fetchDomainCatalog() {
  const result = await api.get<{ categories: DomainCategory[] }>('/web/search/domain-catalog')
  return result.categories ?? []
}
