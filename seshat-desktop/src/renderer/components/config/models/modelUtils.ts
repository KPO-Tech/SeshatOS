import type { ProviderModel, ProviderSetting } from '../providers/providerTypes'

export function formatTokens(value: number) {
  if (!value) return 'Unknown'
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return value.toLocaleString()
}

export function formatModelSource(source: ProviderModel['source']) {
  return source === 'user' ? 'Custom' : 'Catalog'
}

/** Every word of the search has to be found in the model name, its id or its provider's name. */
export function matchesModelSearch(model: ProviderModel, provider: ProviderSetting, query: string): boolean {
  const haystack = `${model.display_name} ${model.model_id} ${provider.name} ${provider.provider}`.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word))
}
