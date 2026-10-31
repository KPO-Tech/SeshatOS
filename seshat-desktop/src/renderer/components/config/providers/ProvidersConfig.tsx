import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Refresh } from '@icon-park/react'
import { ProviderEmptyState } from './ProviderEmptyState'
import { AddProviderDialog } from './AddProviderDialog'
import { ProviderCard, type TestResult } from './ProviderCard'
import { ProvidersAside } from './ProvidersAside'
import {
  deleteProviderSetting,
  fetchProviderChoices,
  fetchProviderModels,
  fetchProviderSettings,
  fetchSystemStatus,
  setDefaultProvider,
  syncProviderModels,
  updateProviderSetting
} from './providerApi'
import type { ProviderChoice, ProviderModel, ProviderSetting } from './providerTypes'
import { buildProviderRows, isCodexProvider, upsertProviderSetting } from './providerUtils'

/** The providers of the assistant: each one as a card with its key, its state, a test and its default model. */
export function ProvidersConfig() {
  const [catalog, setCatalog] = useState<ProviderChoice[]>([])
  const [settings, setSettings] = useState<ProviderSetting[]>([])
  const [systemMode, setSystemMode] = useState<'standalone' | 'connected' | null>(null)
  const [models, setModels] = useState<Record<string, ProviderModel[]>>({})
  const [tests, setTests] = useState<Record<string, TestResult>>({})
  const [adding, setAdding] = useState<{ provider?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextCatalog, nextSettings, status] = await Promise.all([fetchProviderChoices(), fetchProviderSettings(), fetchSystemStatus().catch(() => null)])
      const localMode = status?.mode !== 'connected'
      setCatalog(nextCatalog)
      setSettings(localMode ? nextSettings : nextSettings.filter((setting) => !isCodexProvider(setting.provider)))
      setSystemMode(status?.mode ?? 'standalone')
      // The models of every provider that is set up, so that the cards can name them and offer a default.
      void Promise.all(
        (localMode ? nextSettings : nextSettings.filter((setting) => !isCodexProvider(setting.provider))).map((setting) =>
          fetchProviderModels(setting.id).then((list) => setModels((current) => ({ ...current, [setting.id]: list })), () => undefined)
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the providers.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visibleCatalog = useMemo(() => (systemMode === 'connected' ? catalog.filter((entry) => !isCodexProvider(entry.id)) : catalog), [catalog, systemMode])
  const rows = useMemo(() => buildProviderRows(visibleCatalog, settings), [visibleCatalog, settings])
  // The providers that are set up come first, the default one at the top.
  const ordered = useMemo(() => [...rows].sort((a, b) => Number(Boolean(b.setting?.is_default)) - Number(Boolean(a.setting?.is_default)) || Number(Boolean(b.setting)) - Number(Boolean(a.setting))), [rows])

  async function run(id: string, action: () => Promise<void>, failure: string) {
    setBusyId(id)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : failure)
    } finally {
      setBusyId(null)
    }
  }

  // A test is the list of models asked of the provider: it answers only if the key and the address are good.
  async function test(setting: ProviderSetting) {
    setTests((current) => ({ ...current, [setting.id]: { state: 'testing' } }))
    try {
      const list = await syncProviderModels(setting.id)
      setModels((current) => ({ ...current, [setting.id]: list }))
      setTests((current) => ({ ...current, [setting.id]: { state: 'ok', models: list.length } }))
    } catch (err) {
      setTests((current) => ({ ...current, [setting.id]: { state: 'failed', message: err instanceof Error ? err.message : 'The provider did not answer.' } }))
    }
  }

  async function testAll() {
    await Promise.all(settings.map((setting) => test(setting)))
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">Configured providers</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3.5 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50">
            <Refresh theme="outline" size={14} />
            Refresh
          </button>
          <button type="button" onClick={() => void testAll()} disabled={settings.length === 0} className="h-9 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3.5 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50">
            Test all
          </button>
          <button type="button" onClick={() => setAdding({})} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90">
            <Plus theme="outline" size={15} />
            Add provider
          </button>
        </div>
      </div>

      {error && <div className="mb-3 rounded-xl border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}

      <div className="flex flex-col gap-4 @4xl:flex-row @4xl:items-start">
        <div className="grid min-w-0 flex-1 gap-3">
          {loading && rows.length === 0 ? (
            <ProviderEmptyState label="Loading providers..." />
          ) : ordered.length === 0 ? (
            <ProviderEmptyState label="No providers yet." />
          ) : (
            ordered.map((row) => (
              <ProviderCard
                key={row.id}
                row={row}
                models={row.setting ? models[row.setting.id] ?? [] : []}
                busy={row.setting?.id === busyId}
                test={row.setting ? tests[row.setting.id] : undefined}
                onSetUp={() => setAdding({ provider: row.provider })}
                onTest={(setting) => void test(setting)}
                onSetDefault={(setting) =>
                  void run(setting.id, async () => {
                    const updated = await setDefaultProvider(setting.id)
                    setSettings((current) => current.map((item) => ({ ...item, is_default: item.id === updated.id })))
                  }, 'Failed to set the default provider.')
                }
                onRemove={(setting) => {
                  if (!window.confirm(`Remove ${row.name}? Its key is forgotten.`)) return
                  void run(setting.id, async () => {
                    await deleteProviderSetting(setting.id)
                    setSettings((current) => current.filter((item) => item.id !== setting.id))
                  }, 'Failed to remove the provider.')
                }}
                onChangeDefaultModel={(setting, modelId) =>
                  void run(setting.id, async () => {
                    const updated = await updateProviderSetting(setting.id, { model_id: modelId })
                    setSettings((current) => upsertProviderSetting(current, updated))
                    setModels((current) => ({ ...current, [setting.id]: (current[setting.id] ?? []).map((model) => ({ ...model, is_default: model.model_id === modelId })) }))
                  }, 'Failed to change the default model.')
                }
                onChangeSecret={(setting, change) =>
                  run(setting.id, async () => {
                    const updated = await updateProviderSetting(setting.id, change)
                    setSettings((current) => upsertProviderSetting(current, updated))
                  }, 'Failed to save the change.')
                }
                onProviderChanged={(setting) => {
                  if (!setting) return void load()
                  setSettings((current) => current.map((item) => (item.id === setting.id ? setting : item)))
                }}
                onError={setError}
              />
            ))
          )}
        </div>
        <ProvidersAside settings={settings} onAdd={() => setAdding({})} />
      </div>

      {adding && (
        <AddProviderDialog
          choices={visibleCatalog}
          initialProvider={adding.provider}
          onAdded={(created) => {
            setSettings((current) => upsertProviderSetting(current, created))
            void fetchProviderModels(created.id).then((list) => setModels((current) => ({ ...current, [created.id]: list })), () => undefined)
          }}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  )
}
