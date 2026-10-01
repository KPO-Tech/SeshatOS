import { useState } from 'react'
import { Delete, Edit } from '@icon-park/react'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminPageHeader } from '../shared/AdminPageHeader'
import { AdminEmptyRow, AdminIconButton, AdminStatusBadge, AdminTable, AdminTd, AdminTh, AdminTr } from '../shared/AdminTable'
import { AgentPresetModal } from './AgentPresetModal'
import { deleteAdminAgentPreset, useAdminAgentPresets } from './useAdminAgentPresets'
import type { OrgAgentPreset } from '../types'

export function AgentPresetsView() {
  const { presets, loading, error, refetch } = useAdminAgentPresets()
  const [editing, setEditing] = useState<OrgAgentPreset | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(preset: OrgAgentPreset) {
    if (deletingId) return
    if (!window.confirm(`Delete ${preset.name || preset.slug}? Devices using this preset fall back to the built-in registry.`)) return
    setActionError(null)
    setDeletingId(preset.id)
    try {
      await deleteAdminAgentPreset(preset.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete this agent preset.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AdminPageHeader title="Agents" actionLabel="New preset" onAction={() => setEditing('new')} />
      {(error || actionError) && <AdminBanner message={error || actionError || ''} onDismiss={() => setActionError(null)} />}

      <AdminTable head={<><AdminTh>Preset</AdminTh><AdminTh>Model</AdminTh><AdminTh>Mode</AdminTh><AdminTh>Status</AdminTh><AdminTh /></>}>
        {loading ? (
          <AdminEmptyRow colSpan={5}>Loading…</AdminEmptyRow>
        ) : presets.length === 0 ? (
          <AdminEmptyRow colSpan={5}>No agent presets yet</AdminEmptyRow>
        ) : (
          presets.map((p) => (
            <AdminTr key={p.id}>
              <AdminTd>
                <div className="font-semibold text-[var(--text-primary)]">{p.name || p.slug}</div>
                <div className="font-mono text-[11px] text-[var(--text-muted)]">{p.slug}</div>
              </AdminTd>
              <AdminTd muted>{p.model || 'Default'}</AdminTd>
              <AdminTd>
                <div className="flex gap-1">
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">{p.permission_mode || 'default'}</span>
                  <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">{p.isolation || 'default'}</span>
                </div>
              </AdminTd>
              <AdminTd><AdminStatusBadge tone={p.enabled ? 'success' : 'neutral'}>{p.enabled ? 'Enabled' : 'Disabled'}</AdminStatusBadge></AdminTd>
              <AdminTd align="right">
                <div className="flex justify-end gap-1">
                  <AdminIconButton label="Edit" onClick={() => setEditing(p)}><Edit size={14} /></AdminIconButton>
                  <AdminIconButton label="Delete" onClick={() => handleDelete(p)} disabled={deletingId === p.id}><Delete size={14} /></AdminIconButton>
                </div>
              </AdminTd>
            </AdminTr>
          ))
        )}
      </AdminTable>

      {editing && (
        <AgentPresetModal
          preset={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); void refetch() }}
        />
      )}
    </div>
  )
}
