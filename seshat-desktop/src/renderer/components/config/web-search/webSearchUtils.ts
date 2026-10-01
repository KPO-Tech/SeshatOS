import type { DomainCategory, SearchProviderConfig, WebSearchForm, WebSearchSettings } from './webSearchTypes'

export function settingsToForm(settings: WebSearchSettings): WebSearchForm {
  return {
    enabled: settings.enabled,
    allow_env_fallback: settings.allow_env_fallback,
    max_queries_per_day: settings.max_queries_per_day
  }
}

export function allCatalogDomains(categories: DomainCategory[]) {
  const domains = new Set<string>()
  categories.forEach((category) => category.domains.forEach((domain) => domains.add(domain)))
  return domains
}

export function initialActiveDomains(settings: WebSearchSettings, categories: DomainCategory[]) {
  const allDomains = allCatalogDomains(categories)
  const allowedDomains = settings.allowed_domains ?? []
  return allowedDomains.length > 0 ? new Set(allowedDomains) : allDomains
}

export function domainsToAllowedList(activeDomains: Set<string>, catalogDomains: Set<string>) {
  return activeDomains.size >= catalogDomains.size ? [] : Array.from(activeDomains).sort()
}

export function providerStatus(provider: SearchProviderConfig) {
  if (!provider.enabled) return { label: 'Disabled', tone: 'muted' as const }
  if (provider.requires_api_key && !provider.has_api_key) return { label: 'Missing key', tone: 'warn' as const }
  if (provider.requires_base_url && !provider.base_url && !provider.default_base_url) return { label: 'Missing URL', tone: 'warn' as const }
  return { label: 'Ready', tone: 'success' as const }
}

export function providerInitials(provider: SearchProviderConfig) {
  return (provider.label || provider.provider).slice(0, 2).toUpperCase()
}
