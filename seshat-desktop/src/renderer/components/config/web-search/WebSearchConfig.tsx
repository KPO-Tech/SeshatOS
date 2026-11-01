import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActionButton, Notice, SettingRow, SettingsCard, SettingsPage, StatusBadge, TextField, Toggle } from '../../settings/kit'
import { DomainCatalog } from './DomainCatalog'
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
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const catalogDomains = useMemo(() => allCatalogDomains(catalog), [catalog])
  const searchProviders = providers.filter((provider) => provider.kind !== 'research')
  const researchProviders = providers.filter((provider) => provider.kind === 'research')
  const readyProviders = searchProviders.filter((provider) => provider.enabled && (!provider.requires_api_key || provider.has_api_key))

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
    setDirty(true)
  }

  async function save() {
    if (!settings || saving) return
    setSaving(true)
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
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save web search settings.')
    } finally {
      setSaving(false)
    }
  }

  function toggleDomain(domain: string) {
    setActiveDomains((current) => {
      const next = new Set(current)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
    setDirty(true)
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
    setDirty(true)
  }

  function updateProvider(updated: SearchProviderConfig) {
    setProviders((current) => current.map((provider) => provider.provider === updated.provider ? updated : provider))
  }

  return (
    <SettingsPage
      id="web-search"
      badge={<StatusBadge tone={form.enabled && readyProviders.length > 0 ? 'ok' : 'muted'}>{!form.enabled ? 'Off' : `${readyProviders.length} ready`}</StatusBadge>}
      actions={
        <>
          {dirty && <span className="text-[12px] text-[var(--text-muted)]">Unsaved changes</span>}
          <ActionButton type="button" tone={dirty ? 'primary' : 'default'} disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </ActionButton>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}

      {!loading && (
        <>
          <SettingsCard>
            <SettingRow title="Search the web">
              <Toggle label="Search the web" enabled={form.enabled} onChange={(enabled) => updateForm('enabled', enabled)} />
            </SettingRow>
            <SettingRow title="Use keys from the environment" hint="When no key is saved here.">
              <Toggle label="Use keys from the environment" enabled={form.allow_env_fallback} onChange={(enabled) => updateForm('allow_env_fallback', enabled)} />
            </SettingRow>
            <SettingRow title="Queries per day" hint="0 is unlimited.">
              <TextField label="Queries per day" value={String(form.max_queries_per_day)} onChange={(value) => updateForm('max_queries_per_day', Math.max(0, Number.parseInt(value, 10) || 0))} width={100} />
            </SettingRow>
          </SettingsCard>

          <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
            {searchProviders.map((provider) => (
              <SearchProviderCard key={provider.provider} provider={provider} onSaved={updateProvider} />
            ))}
          </div>

          {researchProviders.length > 0 && (
            <>
              <h2 className="m-0 mt-2 text-[13px] font-semibold text-[var(--text-secondary)]">Research sources</h2>
              <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                {researchProviders.map((provider) => (
                  <SearchProviderCard key={provider.provider} provider={provider} onSaved={updateProvider} />
                ))}
              </div>
            </>
          )}

          {catalog.length > 0 && (
            <DomainCatalog categories={catalog} activeDomains={activeDomains} orgBlockedCount={settings?.org_blocked_domains?.length ?? 0} onToggle={toggleDomain} onToggleCategory={toggleCategory} />
          )}
        </>
      )}
    </SettingsPage>
  )
}
