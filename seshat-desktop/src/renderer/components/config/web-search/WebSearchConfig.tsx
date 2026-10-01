import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import { DomainCatalog } from './DomainCatalog'
import { GlobalWebSearchSettings } from './GlobalWebSearchSettings'
import { SearchProviderCard } from './SearchProviderCard'
import {
  fetchDomainCatalog,
  fetchSearchProviders,
  fetchWebSearchSettings,
  updateWebSearchSettings
} from './webSearchApi'
import type { DomainCategory, SearchProviderConfig, WebSearchForm, WebSearchSettings } from './webSearchTypes'
import { allCatalogDomains, domainsToAllowedList, initialActiveDomains, settingsToForm } from './webSearchUtils'

export function WebSearchConfig() {
  const [settings, setSettings] = useState<WebSearchSettings | null>(null)
  const [providers, setProviders] = useState<SearchProviderConfig[]>([])
  const [catalog, setCatalog] = useState<DomainCategory[]>([])
  const [form, setForm] = useState<WebSearchForm>({ enabled: true, allow_env_fallback: true, max_queries_per_day: 0 })
  const [activeDomains, setActiveDomains] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [savingDomains, setSavingDomains] = useState(false)
  const [globalSaved, setGlobalSaved] = useState(false)
  const [domainsSaved, setDomainsSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const catalogDomains = useMemo(() => allCatalogDomains(catalog), [catalog])
  const readyProviders = providers.filter((provider) => provider.enabled && (!provider.requires_api_key || provider.has_api_key))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSettings, nextProviders, nextCatalog] = await Promise.all([
        fetchWebSearchSettings(),
        fetchSearchProviders(),
        fetchDomainCatalog()
      ])
      setSettings(nextSettings)
      setProviders(nextProviders)
      setCatalog(nextCatalog)
      setForm(settingsToForm(nextSettings))
      setActiveDomains(initialActiveDomains(nextSettings, nextCatalog))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load web search settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateForm<K extends keyof WebSearchForm>(key: K, value: WebSearchForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setGlobalSaved(false)
  }

  async function saveGlobal() {
    if (!settings || savingGlobal) return
    setSavingGlobal(true)
    setError(null)
    try {
      const updated = await updateWebSearchSettings({
        enabled: form.enabled,
        allow_env_fallback: form.allow_env_fallback,
        max_queries_per_day: form.max_queries_per_day,
        allowed_domains: domainsToAllowedList(activeDomains, catalogDomains),
        blocked_domains: settings.blocked_domains ?? [],
        provider_setting_ids: settings.provider_setting_ids ?? []
      })
      setSettings(updated)
      setGlobalSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save web search settings.')
    } finally {
      setSavingGlobal(false)
    }
  }

  async function saveDomains() {
    if (!settings || savingDomains) return
    setSavingDomains(true)
    setError(null)
    try {
      const updated = await updateWebSearchSettings({
        enabled: form.enabled,
        allow_env_fallback: form.allow_env_fallback,
        max_queries_per_day: form.max_queries_per_day,
        allowed_domains: domainsToAllowedList(activeDomains, catalogDomains),
        blocked_domains: settings.blocked_domains ?? [],
        provider_setting_ids: settings.provider_setting_ids ?? []
      })
      setSettings(updated)
      setDomainsSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save domain policy.')
    } finally {
      setSavingDomains(false)
    }
  }

  function toggleDomain(domain: string) {
    setActiveDomains((current) => {
      const next = new Set(current)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
    setDomainsSaved(false)
  }

  function toggleCategory(domains: string[]) {
    setActiveDomains((current) => {
      const next = new Set(current)
      const allActive = domains.every((domain) => next.has(domain))
      domains.forEach((domain) => {
        if (allActive) next.delete(domain)
        else next.add(domain)
      })
      return next
    })
    setDomainsSaved(false)
  }

  function updateProvider(updated: SearchProviderConfig) {
    setProviders((current) => current.map((provider) => provider.provider === updated.provider ? updated : provider))
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-[var(--accent-danger)] bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Metric label="Providers" value={String(providers.length)} />
        <Metric label="Ready" value={String(readyProviders.length)} />
        <Metric label="Active domains" value={String(activeDomains.size)} />
      </section>

      {loading ? (
        <ProviderEmptyState label="Loading web search configuration..." />
      ) : (
        <>
          <GlobalWebSearchSettings form={form} saving={savingGlobal} saved={globalSaved} onChange={updateForm} onSave={saveGlobal} />

          <section>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Search providers</h2>
              <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-50">
                Refresh
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {providers.length === 0 ? (
                <ProviderEmptyState label="No search providers available." />
              ) : (
                providers.map((provider) => (
                  <SearchProviderCard key={provider.provider} provider={provider} onSaved={updateProvider} />
                ))
              )}
            </div>
          </section>

          {catalog.length > 0 && (
            <DomainCatalog
              categories={catalog}
              activeDomains={activeDomains}
              saving={savingDomains}
              saved={domainsSaved}
              orgBlockedCount={settings?.org_blocked_domains?.length ?? 0}
              onToggle={toggleDomain}
              onToggleCategory={toggleCategory}
              onSave={saveDomains}
            />
          )}
        </>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5">
      <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[20px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}
