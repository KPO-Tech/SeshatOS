import { useEffect, useMemo, useState } from 'react'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { pickDefaultModel } from '@renderer/lib/defaultModel'
import {
  createProviderModel,
  fetchProviderModels,
  fetchProviderSettings,
  setDefaultProvider,
  syncProviderModels,
  updateProviderSetting
} from '../providers/providerApi'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import type { ProviderModel, ProviderSetting } from '../providers/providerTypes'
import { AddCustomModelForm } from './AddCustomModelForm'
import { ProviderModelGroup } from './ProviderModelGroup'
import { matchesModelSearch } from './modelUtils'

export function ModelsConfig() {
  const [settings, setSettings] = useState<ProviderSetting[]>([])
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [customProvider, setCustomProvider] = useState<ProviderSetting | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Providers the person opened or closed by hand; the one holding the default model starts open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const nextSettings = await fetchProviderSettings()
      setSettings(nextSettings)
      const entries = await Promise.all(nextSettings.map(async (setting) => [setting.id, await fetchProviderModels(setting.id)] as const))
      setModelsByProvider(Object.fromEntries(entries))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const configured = useMemo(() => settings.filter((setting) => setting.connection_status !== 'disabled'), [settings])
  const current = useMemo(() => pickDefaultModel(configured, (provider) => modelsByProvider[provider.id] ?? []), [configured, modelsByProvider])
  const modelCount = configured.reduce((total, setting) => total + (modelsByProvider[setting.id]?.length ?? 0), 0)
  const searching = query.trim() !== ''

  async function syncProvider(setting: ProviderSetting) {
    setBusyId(setting.id)
    setError(null)
    try {
      const models = await syncProviderModels(setting.id)
      setModelsByProvider((existing) => ({ ...existing, [setting.id]: models }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync models.')
    } finally {
      setBusyId(null)
    }
  }

  // The model the app starts with is a provider and the model that provider uses: both are saved, so a new conversation opens on it.
  async function chooseDefault(setting: ProviderSetting, model: ProviderModel) {
    setBusyId(setting.id)
    setError(null)
    try {
      let updated = setting
      if (setting.model_id !== model.model_id) updated = await updateProviderSetting(setting.id, { model_id: model.model_id })
      if (!setting.is_default) updated = await setDefaultProvider(setting.id)
      setSettings((existing) => existing.map((item) => (item.id === updated.id ? { ...item, ...updated, model_id: model.model_id, is_default: true } : { ...item, is_default: false })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select default model.')
    } finally {
      setBusyId(null)
    }
  }

  async function addCustomModel(values: { model_id: string; display_name?: string; context_window?: number; max_output?: number }) {
    if (!customProvider) return
    setBusyId(customProvider.id)
    setError(null)
    try {
      const created = await createProviderModel(customProvider.id, values)
      setModelsByProvider((existing) => ({ ...existing, [customProvider.id]: [...(existing[customProvider.id] ?? []), created] }))
      setCustomProvider(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add custom model.')
    } finally {
      setBusyId(null)
    }
  }

  function isOpen(setting: ProviderSetting, matching: number) {
    if (searching) return matching > 0
    return toggled[setting.id] ?? current?.provider.id === setting.id
  }

  const groups = configured
    .map((setting) => {
      const all = modelsByProvider[setting.id] ?? []
      const shown = searching ? all.filter((model) => matchesModelSearch(model, setting, query)) : all
      return { setting, all, shown }
    })
    // While searching, a provider with nothing that matches has nothing to show.
    .filter((group) => !searching || group.shown.length > 0)

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-[var(--accent-danger)] bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      )}

      <section className="flex items-center gap-3 rounded-lg border border-[color-mix(in_srgb,var(--accent-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--surface-panel))] px-4 py-3">
        {current ? <ProviderIcon provider={current.provider.provider} size={34} className="shrink-0" /> : null}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Default model</div>
          <div className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
            {loading ? 'Loading...' : current ? current.model.display_name || current.model.model_id : 'None yet'}
          </div>
          <div className="truncate text-[12px] text-[var(--text-muted)]">
            {current ? `${current.provider.name || current.provider.provider}, used by new conversations` : 'Add a provider, then pick a model below.'}
          </div>
        </div>
        <div className="shrink-0 text-right text-[12px] text-[var(--text-muted)]">
          {configured.length} providers
          <br />
          {modelCount} models
        </div>
      </section>

      {customProvider && (
        <AddCustomModelForm
          provider={customProvider}
          saving={busyId === customProvider.id}
          onCancel={() => setCustomProvider(null)}
          onSubmit={addCustomModel}
        />
      )}

      <section>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models or providers"
            aria-label="Search models"
            className="h-9 min-w-0 flex-1 rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
          />
          <button type="button" onClick={() => void load()} disabled={loading} className="h-9 rounded-md border border-[var(--border-soft)] px-3 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-50">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="mt-3 grid gap-2">
          {loading ? (
            <ProviderEmptyState label="Loading model catalogs..." />
          ) : configured.length === 0 ? (
            <ProviderEmptyState label="Add a provider first, then models will appear here." />
          ) : groups.length === 0 ? (
            <ProviderEmptyState label={`No model matches "${query.trim()}".`} />
          ) : (
            groups.map(({ setting, all, shown }) => (
              <ProviderModelGroup
                key={setting.id}
                provider={setting}
                models={shown}
                total={all.length}
                defaultModelId={current?.provider.id === setting.id ? current.model.model_id : null}
                open={isOpen(setting, shown.length)}
                loading={loading}
                busy={busyId === setting.id}
                onToggle={(provider) => setToggled((existing) => ({ ...existing, [provider.id]: !isOpen(provider, shown.length) }))}
                onSync={syncProvider}
                onAddCustom={setCustomProvider}
                onChoose={chooseDefault}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
