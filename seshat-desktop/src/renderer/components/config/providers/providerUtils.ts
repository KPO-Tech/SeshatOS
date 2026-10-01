import type { ProviderCatalogEntry, ProviderForm, ProviderModel, ProviderRowModel, ProviderSetting } from './providerTypes'

export function buildProviderRows(catalog: ProviderCatalogEntry[], settings: ProviderSetting[]): ProviderRowModel[] {
  const configuredByProvider = new Map(settings.map((setting) => [setting.provider, setting]))
  const seen = new Set<string>()
  const rows = catalog.map((entry) => {
    seen.add(entry.name)
    return {
      id: entry.name,
      provider: entry.name,
      name: entry.display_name,
      description: entry.description || '',
      authTypeLabel: authTypeLabel(entry.auth_type),
      setting: configuredByProvider.get(entry.name) ?? null
    }
  })

  for (const setting of settings) {
    if (seen.has(setting.provider)) continue
    rows.push({
      id: setting.provider,
      provider: setting.provider,
      name: setting.name || providerLabel(setting.provider),
      description: setting.base_url || setting.provider,
      authTypeLabel: authTypeLabel(setting.auth_kind),
      setting
    })
  }

  return rows
}

export function initialProviderForm(entry?: ProviderCatalogEntry): ProviderForm {
  const provider = entry?.name ?? ''
  const authKind = provider === 'codex' ? 'oauth' : provider === 'ollama' || entry?.auth_type === 'none' ? 'none' : 'api_key'
  return {
    provider,
    name: entry?.display_name ?? '',
    auth_kind: authKind,
    api_key: '',
    base_url: provider === 'ollama' ? 'http://localhost:11434' : ''
  }
}

export function upsertProviderSetting(settings: ProviderSetting[], next: ProviderSetting) {
  const existing = settings.some((setting) => setting.id === next.id)
  if (existing) return settings.map((setting) => setting.id === next.id ? next : setting)
  return [next, ...settings]
}

export function getProviderConnection(setting: ProviderSetting): { label: string; tone: 'success' | 'muted' } {
  if (setting.provider === 'ollama') return { label: 'Local', tone: 'success' }
  if (setting.auth_kind === 'oauth') {
    return setting.connection_status === 'connected'
      ? { label: 'Connected', tone: 'success' }
      : { label: setting.connection_status || 'OAuth pending', tone: 'muted' }
  }
  if (setting.has_api_key) return { label: 'Connected', tone: 'success' }
  return { label: 'Missing key', tone: 'muted' }
}

export function formatModelMeta(model: ProviderModel) {
  const context = model.context_window ? `${formatNumber(model.context_window)} ctx` : 'context unknown'
  const output = model.max_output ? `${formatNumber(model.max_output)} max` : 'output unknown'
  return `${context} - ${output} - ${model.source || 'catalog'}`
}

export function authTypeLabel(authType: string) {
  if (authType === 'none') return 'No key'
  if (authType === 'oauth') return 'OAuth'
  return 'API key'
}

export function isCodexProvider(provider: string) {
  return provider.toLowerCase() === 'codex'
}

function formatNumber(value: number) {
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return value.toLocaleString()
}

function providerLabel(provider: string) {
  return provider.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
