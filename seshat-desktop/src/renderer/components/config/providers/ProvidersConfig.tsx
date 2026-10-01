import { useEffect, useMemo, useState } from 'react'
import {
  createProviderSetting,
  deleteProviderSetting,
  fetchProviderCatalog,
  fetchProviderModels,
  fetchProviderSettings,
  fetchSystemStatus,
  setDefaultProvider,
  syncProviderModels
} from './providerApi'
import { ProviderEmptyState } from './ProviderEmptyState'
import { ProviderRow } from './ProviderRow'
import { ProviderSelect } from './ProviderSelect'
import type { ProviderCatalogEntry, ProviderForm, ProviderModel, ProviderSetting } from './providerTypes'
import { buildProviderRows, initialProviderForm, isCodexProvider, upsertProviderSetting } from './providerUtils'

export function ProvidersConfig() {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([])
  const [settings, setSettings] = useState<ProviderSetting[]>([])
  const [systemMode, setSystemMode] = useState<'standalone' | 'connected' | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [models, setModels] = useState<Record<string, ProviderModel[]>>({})
  const [form, setForm] = useState<ProviderForm>({ provider: '', name: '', auth_kind: 'api_key', api_key: '', base_url: '' })
  const [providerMenuOpen, setProviderMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [nextCatalog, nextSettings, status] = await Promise.all([
        fetchProviderCatalog(),
        fetchProviderSettings(),
        fetchSystemStatus().catch(() => null)
      ])
      const localMode = status?.mode !== 'connected'
      const visibleCatalog = localMode ? nextCatalog : nextCatalog.filter((entry) => !isCodexProvider(entry.name))
      setCatalog(nextCatalog)
      setSettings(localMode ? nextSettings : nextSettings.filter((setting) => !isCodexProvider(setting.provider)))
      setSystemMode(status?.mode ?? 'standalone')
      setForm((current) => current.provider && visibleCatalog.some((entry) => entry.name === current.provider) ? current : initialProviderForm(visibleCatalog[0]))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const visibleCatalog = useMemo(() => (
    systemMode === 'connected' ? catalog.filter((entry) => !isCodexProvider(entry.name)) : catalog
  ), [catalog, systemMode])
  const rows = useMemo(() => buildProviderRows(visibleCatalog, settings), [visibleCatalog, settings])
  const selectedCatalog = catalog.find((entry) => entry.name === form.provider)
  const isCodex = isCodexProvider(form.provider)
  const canSave = form.provider && (form.auth_kind !== 'api_key' || form.api_key.trim().length > 0 || form.provider === 'ollama' || isCodex)

  function handleProviderChange(provider: string) {
    const entry = catalog.find((item) => item.name === provider)
    setForm(initialProviderForm(entry))
    setProviderMenuOpen(false)
  }

  async function handleAdd() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createProviderSetting({
        provider: form.provider,
        name: form.name || selectedCatalog?.display_name || form.provider,
        auth_kind: form.provider === 'ollama' ? 'none' : isCodex ? 'oauth' : form.auth_kind,
        api_key: form.auth_kind === 'api_key' && !isCodex ? form.api_key : undefined,
        base_url: !isCodex && form.base_url ? form.base_url : undefined
      })
      setSettings((current) => upsertProviderSetting(current, created))
      setExpandedId(isCodex ? created.id : expandedId)
      setForm({ ...initialProviderForm(selectedCatalog), api_key: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add provider.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleModels(setting: ProviderSetting) {
    const nextId = expandedId === setting.id ? null : setting.id
    setExpandedId(nextId)
    if (!nextId || models[setting.id]) return
    setBusyId(setting.id)
    setError(null)
    try {
      const nextModels = await fetchProviderModels(setting.id)
      setModels((current) => ({ ...current, [setting.id]: nextModels }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provider models.')
    } finally {
      setBusyId(null)
    }
  }

  async function syncModels(setting: ProviderSetting) {
    setBusyId(setting.id)
    setError(null)
    try {
      const nextModels = await syncProviderModels(setting.id)
      setModels((current) => ({ ...current, [setting.id]: nextModels }))
      setExpandedId(setting.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync provider models.')
    } finally {
      setBusyId(null)
    }
  }

  async function setDefault(setting: ProviderSetting) {
    setBusyId(setting.id)
    setError(null)
    try {
      const updated = await setDefaultProvider(setting.id)
      setSettings((current) => current.map((item) => ({ ...item, is_default: item.id === updated.id })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default provider.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(setting: ProviderSetting) {
    setBusyId(setting.id)
    setError(null)
    try {
      await deleteProviderSetting(setting.id)
      setSettings((current) => current.filter((item) => item.id !== setting.id))
      if (expandedId === setting.id) setExpandedId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider.')
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

      <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Add provider</h2>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">Connect a local or cloud model provider for chat, tools, and capabilities.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-50">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr] gap-3">
          <ProviderSelect
            catalog={visibleCatalog}
            value={form.provider}
            open={providerMenuOpen}
            onOpenChange={setProviderMenuOpen}
            onChange={handleProviderChange}
          />
          <label className="grid gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--text-muted)]">Name</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
          </label>
          {!isCodex && form.provider !== 'ollama' && (
            <label className="grid gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">API key</span>
              <input value={form.api_key} onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))} type="password" placeholder="Saved encrypted by the backend" className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
            </label>
          )}
          {!isCodex && (
            <label className="grid gap-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">Base URL</span>
              <input value={form.base_url} onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))} placeholder={form.provider === 'ollama' ? 'http://localhost:11434' : 'Provider default'} className="h-9 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none" />
            </label>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
            {isCodex
              ? 'Codex uses a browser sign-in with your ChatGPT account. It is only available for local desktop accounts.'
              : selectedCatalog?.description || 'Provider catalog is loaded from the local backend.'}
          </p>
          <button type="button" onClick={() => void handleAdd()} disabled={!canSave || saving} className="h-9 rounded-md bg-[var(--text-primary)] px-4 text-[13px] font-semibold text-[var(--surface-root)] disabled:cursor-not-allowed disabled:opacity-45">
            {saving ? 'Adding...' : isCodex ? 'Add OAuth provider' : 'Add'}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Configured providers</h2>
        <div className="mt-3 grid gap-2">
          {loading ? (
            <ProviderEmptyState label="Loading providers..." />
          ) : rows.length === 0 ? (
            <ProviderEmptyState label="No providers configured yet." />
          ) : (
            rows.map((row) => (
              <ProviderRow
                key={row.id}
                row={row}
                expanded={row.setting?.id === expandedId}
                busy={row.setting?.id === busyId}
                models={row.setting ? models[row.setting.id] ?? [] : []}
                onToggleModels={toggleModels}
                onSyncModels={syncModels}
                onSetDefault={setDefault}
                onRemove={remove}
                onProviderChanged={(setting) => {
                  if (!setting) return void load()
                  setSettings((current) => current.map((item) => item.id === setting.id ? setting : item))
                }}
                onError={setError}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
