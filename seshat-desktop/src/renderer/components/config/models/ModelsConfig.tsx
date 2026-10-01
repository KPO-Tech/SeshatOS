import { useEffect, useMemo, useState } from 'react'
import {
  createProviderModel,
  fetchProviderModels,
  fetchProviderSettings,
  syncProviderModels,
  updateProviderSetting
} from '../providers/providerApi'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import type { ProviderModel, ProviderSetting } from '../providers/providerTypes'
import { AddCustomModelForm } from './AddCustomModelForm'
import { ModelCard } from './ModelCard'
import { ProviderModelGroup } from './ProviderModelGroup'
import { buildModelChoices } from './modelUtils'

export function ModelsConfig() {
  const [settings, setSettings] = useState<ProviderSetting[]>([])
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [customProvider, setCustomProvider] = useState<ProviderSetting | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const configured = settings.filter((setting) => setting.connection_status !== 'disabled')
  const choices = useMemo(() => buildModelChoices(configured, modelsByProvider), [configured, modelsByProvider])
  const selectedCount = choices.filter((choice) => choice.selected).length

  async function syncProvider(setting: ProviderSetting) {
    setBusyId(setting.id)
    setError(null)
    try {
      const models = await syncProviderModels(setting.id)
      setModelsByProvider((current) => ({ ...current, [setting.id]: models }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync models.')
    } finally {
      setBusyId(null)
    }
  }

  async function selectModel(setting: ProviderSetting, model: ProviderModel) {
    setBusyId(setting.id)
    setError(null)
    try {
      const updated = await updateProviderSetting(setting.id, { model_id: model.model_id })
      setSettings((current) => current.map((item) => item.id === updated.id ? updated : item))
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
      setModelsByProvider((current) => ({ ...current, [customProvider.id]: [...(current[customProvider.id] ?? []), created] }))
      setCustomProvider(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add custom model.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-[var(--accent-danger)] bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">
          {error}
        </div>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Metric label="Providers" value={String(configured.length)} />
        <Metric label="Models" value={String(choices.length)} />
        <Metric label="Selected defaults" value={String(selectedCount)} />
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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Provider model catalogs</h2>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-50">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <div className="mt-3 grid gap-2">
          {loading ? (
            <ProviderEmptyState label="Loading model catalogs..." />
          ) : configured.length === 0 ? (
            <ProviderEmptyState label="Add a provider first, then models will appear here." />
          ) : (
            configured.map((setting) => (
              <ProviderModelGroup
                key={setting.id}
                provider={setting}
                models={modelsByProvider[setting.id] ?? []}
                loading={loading}
                busy={busyId === setting.id}
                onSync={syncProvider}
                onAddCustom={setCustomProvider}
              />
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Available models</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {loading ? (
            <ProviderEmptyState label="Loading models..." />
          ) : choices.length === 0 ? (
            <ProviderEmptyState label="No models available yet. Sync a provider catalog to begin." />
          ) : (
            choices.map((choice) => (
              <ModelCard
                key={choice.id}
                provider={choice.provider}
                model={choice.model}
                selected={choice.selected}
                busy={busyId === choice.provider.id}
                onSelect={selectModel}
              />
            ))
          )}
        </div>
      </section>
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
