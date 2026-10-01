import { useEffect, useState } from 'react'
import { SoftButton, StatusPill } from '../knowledge/KnowledgePrimitives'
import { MCPServerIcon } from './MCPIcons'
import { approveMCPOrgServer, fetchMCPOrgCatalog, revokeMCPOrgServer } from './mcpApi'
import type { MCPOrgCatalogEntry } from './mcpTypes'

export function MCPOrgCatalog({ onChanged }: { onChanged: () => void }) {
  const [entries, setEntries] = useState<MCPOrgCatalogEntry[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setEntries(await fetchMCPOrgCatalog())
    } catch {
      setEntries([])
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function toggle(entry: MCPOrgCatalogEntry) {
    setBusyId(entry.id)
    setError(null)
    try {
      if (entry.approved) await revokeMCPOrgServer(entry.id)
      else await approveMCPOrgServer(entry.id)
      await load()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization server.')
    } finally {
      setBusyId(null)
    }
  }

  if (entries.length === 0) return null

  return (
    <section>
      <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Organization catalog</h2>
      <p className="mt-1 text-[12px] text-[var(--text-muted)]">Approve shared MCP servers before they can run in this workspace.</p>
      {error && <div className="mt-3 rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
      <div className="mt-3 grid gap-2">
        {entries.map((entry) => (
          <article key={entry.id} className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
            <div className="flex min-w-0 items-center gap-3">
              <MCPServerIcon icon={entry.icon} type={entry.server_type} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{entry.display_name || entry.name}</div>
                  <StatusPill tone={entry.approved ? 'ok' : 'muted'}>{entry.approved ? 'Approved' : 'Pending'}</StatusPill>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-[var(--text-muted)]">{entry.server_type === 'stdio' ? [entry.command, ...(entry.args ?? [])].filter(Boolean).join(' ') : entry.url}</div>
              </div>
            </div>
            <SoftButton tone={entry.approved ? 'success' : 'primary'} onClick={() => void toggle(entry)} disabled={busyId === entry.id}>
              {entry.approved ? 'Active' : 'Approve'}
            </SoftButton>
          </article>
        ))}
      </div>
    </section>
  )
}
