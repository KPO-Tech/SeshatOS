import type { ProviderChoice, ProviderForm, ProviderModel, ProviderRowModel, ProviderSetting } from './providerTypes'

// Main providers always get a row (so they can be set up from it); the catalog's others only once configured.
export function buildProviderRows(choices: ProviderChoice[], settings: ProviderSetting[]): ProviderRowModel[] {
  const configuredByProvider = new Map(settings.map((setting) => [setting.provider, setting]))
  const seen = new Set<string>()
  const rows: ProviderRowModel[] = []
  for (const choice of choices) {
    const setting = configuredByProvider.get(choice.id) ?? null
    if (!choice.main && !setting) continue
    seen.add(choice.id)
    rows.push({
      id: choice.id,
      provider: choice.id,
      name: choice.name,
      description: choice.description || '',
      authTypeLabel: authTypeLabel(choice.auth_type),
      setting
    })
  }

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

export function initialProviderForm(entry?: ProviderChoice): ProviderForm {
  const provider = entry?.id ?? ''
  const authKind = provider === 'codex' ? 'oauth' : provider === 'ollama' || entry?.auth_type === 'none' ? 'none' : 'api_key'
  return {
    provider,
    name: entry?.name ?? '',
    auth_kind: authKind,
    api_key: '',
    // An unverified address is shown so the user confirms it before a key is sent to it.
    base_url: provider === 'ollama' ? 'http://localhost:11434' : entry?.unverified ? entry.base_url ?? '' : ''
  }
}

export type ProviderMenuItem =
  | { kind: 'choice'; choice: ProviderChoice }
  | { kind: 'more'; count: number; expanded: boolean }

/**
 * What the provider menu lists: the main providers, then a "More providers" entry that opens the catalog's others. A search matches
 * the name or id in both lists and opens the second one by itself.
 */
export function providerMenuItems(choices: ProviderChoice[], query: string, moreExpanded: boolean): ProviderMenuItem[] {
  const needle = query.trim().toLowerCase()
  const matches = (choice: ProviderChoice) => !needle || choice.name.toLowerCase().includes(needle) || choice.id.toLowerCase().includes(needle)
  const main = choices.filter((choice) => choice.main && matches(choice))
  const more = choices.filter((choice) => !choice.main && matches(choice))
  const items: ProviderMenuItem[] = main.map((choice) => ({ kind: 'choice', choice }))
  if (more.length === 0) return items
  const expanded = moreExpanded || needle !== ''
  items.push({ kind: 'more', count: more.length, expanded })
  if (expanded) items.push(...more.map((choice): ProviderMenuItem => ({ kind: 'choice', choice })))
  return items
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
