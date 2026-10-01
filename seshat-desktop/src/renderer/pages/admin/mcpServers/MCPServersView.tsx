import { useState } from 'react'
import { Delete, Edit } from '@icon-park/react'
import { AdminBanner } from '../shared/AdminBanner'
import { AdminPageHeader } from '../shared/AdminPageHeader'
import { AdminEmptyRow, AdminIconButton, AdminTable, AdminTd, AdminTh, AdminTr } from '../shared/AdminTable'
import { MCPServerFormModal } from './MCPServerFormModal'
import { deleteAdminMCPServerConfig, useAdminMCPServerConfigs } from './useAdminMCPServerConfigs'
import type { AdminMCPServerConfig } from '../types'

export function MCPServersView() {
  const { configs, loading, error, refetch } = useAdminMCPServerConfigs()
  const [editing, setEditing] = useState<AdminMCPServerConfig | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(config: AdminMCPServerConfig) {
    if (deletingId) return
    if (!window.confirm(`Delete ${config.display_name || config.name}? This cannot be undone.`)) return
    setActionError(null)
    setDeletingId(config.id)
    try {
      await deleteAdminMCPServerConfig(config.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete this MCP server.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AdminPageHeader title="MCP Servers" actionLabel="New MCP server" onAction={() => setEditing('new')} />
      {(error || actionError) && <AdminBanner message={error || actionError || ''} onDismiss={() => setActionError(null)} />}

      <AdminTable head={<><AdminTh>Server</AdminTh><AdminTh>Type</AdminTh><AdminTh>Target</AdminTh><AdminTh /></>}>
        {loading ? (
          <AdminEmptyRow colSpan={4}>Loading…</AdminEmptyRow>
        ) : configs.length === 0 ? (
          <AdminEmptyRow colSpan={4}>No MCP servers configured yet</AdminEmptyRow>
        ) : (
          configs.map((config) => (
            <AdminTr key={config.id}>
              <AdminTd>
                <div className="font-semibold text-[var(--text-primary)]">
                  {config.display_name || config.name}
                  {config.connector_kind && <span className="text-[var(--text-muted)]"> - {config.connector_kind}</span>}
                </div>
                <div className="font-mono text-[11px] text-[var(--text-muted)]">{config.name}</div>
              </AdminTd>
              <AdminTd muted>{config.server_type}</AdminTd>
              <AdminTd muted mono>
                {config.server_type === 'stdio' ? [config.command, ...(config.args ?? [])].filter(Boolean).join(' ') : config.url || 'Not configured'}
              </AdminTd>
              <AdminTd align="right">
                <div className="flex justify-end gap-1">
                  <AdminIconButton label="Edit" onClick={() => setEditing(config)}><Edit size={14} /></AdminIconButton>
                  <AdminIconButton label="Delete" onClick={() => handleDelete(config)} disabled={deletingId === config.id}><Delete size={14} /></AdminIconButton>
                </div>
              </AdminTd>
            </AdminTr>
          ))
        )}
      </AdminTable>

      {editing && (
        <MCPServerFormModal
          config={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); void refetch() }}
        />
      )}
    </div>
  )
}
