import { useEffect, useMemo, useState } from 'react'
import { Crown, Delete, Edit } from '@icon-park/react'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import { fetchProviderCatalog } from '@renderer/components/config/providers/providerApi'
import { isCodexProvider } from '@renderer/components/config/providers/providerUtils'
import type { ProviderCatalogEntry } from '@renderer/components/config/providers/providerTypes'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminCard, AdminCardGrid } from '../shared/AdminCard'
import { AdminIconButton } from '../shared/AdminTable'
import { ProviderFormModal } from './ProviderFormModal'
import { deleteAdminProviderSetting, setAdminProviderSettingDefault, unsetAdminProviderSettingDefault, useAdminProviderSettings } from './useAdminProviderSettings'
import type { OrgProviderSetting } from '../types'

export function ProvidersView() {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([])
  const { settings, loading, error, refetch } = useAdminProviderSettings()
  const [configuring, setConfiguring] = useState<ProviderCatalogEntry | null>(null)
  const [editing, setEditing] = useState<{ entry: ProviderCatalogEntry; setting: OrgProviderSetting } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    // Org-level settings only ever use a plain API key on seshat-server -
    // Codex's OAuth flow has nothing server-side to configure it against.
    fetchProviderCatalog().then((c) => setCatalog(c.filter((entry) => !isCodexProvider(entry.name)))).catch(() => setCatalog([]))
  }, [])

  const settingByProvider = useMemo(() => new Map(settings.map((s) => [s.provider, s])), [settings])

  async function handleDelete(setting: OrgProviderSetting) {
    if (busyId) return
    if (!window.confirm(`Remove the organization's ${setting.provider} credential? This cannot be undone.`)) return
    setActionError(null)
    setBusyId(setting.id)
    try {
      await deleteAdminProviderSetting(setting.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete this provider setting.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggleDefault(setting: OrgProviderSetting) {
    if (busyId) return
    setActionError(null)
    setBusyId(setting.id)
    try {
      if (setting.is_default) await unsetAdminProviderSettingDefault(setting.id)
      else await setAdminProviderSettingDefault(setting.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to update the organization default.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 text-[17px] font-semibold text-[var(--text-primary)]">Providers</div>
      <p className="mb-4 text-[12px] text-[var(--text-muted)]">
        Shared AI provider credentials for the whole organization - configured here, they&apos;re immediately visible in Seshat Console too.
      </p>

      {(error || actionError) && <AdminBanner message={error || actionError || ''} onDismiss={() => setActionError(null)} />}

      {loading ? (
        <p className="text-[13px] text-[var(--text-muted)]">Loading…</p>
      ) : (
        <AdminCardGrid>
          {catalog.map((entry) => {
            const setting = settingByProvider.get(entry.name) ?? null
            return (
              <AdminCard
                key={entry.name}
                icon={<ProviderIcon provider={entry.name} size={32} />}
                title={
                  <span className="flex items-center gap-1.5">
                    {entry.display_name}
                    {setting?.is_default && <Crown size={12} className="text-[var(--accent-warning)]" />}
                  </span>
                }
                subtitle={setting ? `${setting.provider} - ${setting.default_model || 'no default model'}` : entry.description}
                configured={!!setting}
                actions={
                  setting ? (
                    <>
                      <AdminIconButton label={setting.is_default ? 'Unset as organization default' : 'Set as organization default'} onClick={() => handleToggleDefault(setting)} disabled={busyId === setting.id}>
                        <Crown size={14} />
                      </AdminIconButton>
                      <AdminIconButton label="Edit" onClick={() => setEditing({ entry, setting })}><Edit size={14} /></AdminIconButton>
                      <AdminIconButton label="Delete" onClick={() => handleDelete(setting)} disabled={busyId === setting.id}><Delete size={14} /></AdminIconButton>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfiguring(entry)}
                      className="cursor-pointer rounded-md border border-[var(--border-soft)] bg-transparent px-2.5 py-1 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                    >
                      Configure
                    </button>
                  )
                }
              />
            )
          })}
        </AdminCardGrid>
      )}

      {configuring && <ProviderFormModal entry={configuring} onClose={() => setConfiguring(null)} onSuccess={() => { setConfiguring(null); void refetch() }} />}
      {editing && (
        <ProviderFormModal
          entry={editing.entry}
          existing={editing.setting}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); void refetch() }}
        />
      )}
    </div>
  )
}
