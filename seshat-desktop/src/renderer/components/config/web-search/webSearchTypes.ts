export type WebSearchSettings = {
  id?: string
  user_id: string
  enabled: boolean
  provider_setting_ids?: string[]
  allow_env_fallback: boolean
  allowed_domains?: string[]
  blocked_domains?: string[]
  max_queries_per_day: number
  created_at?: number
  updated_at?: number
  org_allowed_domains?: string[]
  org_blocked_domains?: string[]
}

export type SearchProviderConfig = {
  provider: string
  label: string
  enabled: boolean
  has_api_key: boolean
  base_url: string
  auth_username?: string
  requires_api_key: boolean
  requires_base_url: boolean
  default_base_url: string
  priority: number
  updated_at?: number
  source?: string
}

export type DomainCategory = {
  id: string
  label: string
  icon: string
  domains: string[]
}

export type WebSearchForm = {
  enabled: boolean
  allow_env_fallback: boolean
  max_queries_per_day: number
}

export type ProviderTestState = 'idle' | 'running' | 'ok' | 'error'
