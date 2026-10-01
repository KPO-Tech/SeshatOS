export type ProviderSetting = {
  id: string
  provider: string
  name: string
  auth_kind: string
  base_url?: string
  model_id?: string
  has_api_key: boolean
  is_default: boolean
  connection_status: string
  last_error?: string
  oauth_account_email?: string
  oauth_subject?: string
  oauth_expires_at?: number
  updated_at: number
}

export type ProviderModel = {
  id: string
  provider_setting_id: string
  model_id: string
  display_name: string
  context_window: number
  max_output: number
  default_temperature: number
  description?: string
  is_default: boolean
  sort_order: number
  source: 'catalog' | 'user'
  created_at: number
  updated_at: number
}

export type ProviderCatalogEntry = {
  name: string
  display_name: string
  description?: string
  auth_type: string
  auth_types?: string[]
  models: Array<{
    id: string
    description?: string
    context_window?: number
    max_output?: number
  }>
}

export type ProviderForm = {
  provider: string
  name: string
  auth_kind: string
  api_key: string
  base_url: string
}

export type ProviderOAuthChallenge = {
  status: string
  user_code: string
  verification_url: string
  poll_interval_seconds: number
  expires_at: number
}

export type ProviderRowModel = {
  id: string
  provider: string
  name: string
  description: string
  authTypeLabel: string
  setting: ProviderSetting | null
}
