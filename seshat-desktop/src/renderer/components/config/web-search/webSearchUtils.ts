import type { TFunction } from 'i18next'
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

export function providerStatus(provider: SearchProviderConfig, t: TFunction) {
  if (!provider.enabled) return { label: t('config:webSearch.webSearchUtils.disabled'), tone: 'muted' as const }
  if (provider.requires_api_key && !provider.has_api_key) return { label: t('config:webSearch.webSearchUtils.missingKey'), tone: 'warn' as const }
  if (provider.requires_base_url && !provider.base_url && !provider.default_base_url) return { label: t('config:webSearch.webSearchUtils.missingUrl'), tone: 'warn' as const }
  return { label: t('config:webSearch.webSearchUtils.ready'), tone: 'success' as const }
}

