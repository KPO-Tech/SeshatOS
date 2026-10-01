import { useEffect, useMemo, useState } from 'react'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import { SoftButton } from '../knowledge/KnowledgePrimitives'
import { createMCPServer, deleteMCPServer, fetchMCPServers, fetchMCPTools, importMCPJson, reloadMCPServers, updateMCPServer } from './mcpApi'
import { MCPOrgCatalog } from './MCPOrgCatalog'
import { MCPServerCard } from './MCPServerCard'
import { MCPServerForm } from './MCPServerForm'
import type { MCPServer, MCPStatus, MCPToolEntry } from './mcpTypes'

export function MCPConfig() {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [tools, setTools] = useState<Record<string, MCPToolEntry[]>>({})
  const [statuses, setStatuses] = useState<MCPStatus[]>([])
  const [editing, setEditing] = useState<MCPServer | 'new' | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingReload, setPendingReload] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [nextServers, nextTools] = await Promise.all([fetchMCPServers(), fetchMCPTools()])
      setServers(nextServers)
      setTools(nextTools)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP configuration.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const metrics = useMemo(() => {
    const toolCount = Object.values(tools).reduce((sum, items) => sum + items.length, 0)
    return [
      { label: 'Servers', value: String(servers.length) },
      { label: 'Enabled', value: String(servers.filter((server) => server.enabled).length) },
      { label: 'Tools', value: String(toolCount) }
    ]
  }, [servers, tools])

  async function save(payload: Partial<MCPServer>) {
    const id = payload.id
    setBusyId(id ?? 'new')
    setError(null)
    try {
      if (id) await updateMCPServer(id, payload)
      else await createMCPServer(payload)
      setEditing(null)
      setPendingReload(true)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save MCP server.')
    } finally {
      setBusyId(null)
    }
  }

  async function toggle(server: MCPServer, enabled: boolean) {
    setBusyId(server.id)
    setError(null)
    try {
      await updateMCPServer(server.id, { ...server, enabled })
      setServers((current) => current.map((item) => item.id === server.id ? { ...item, enabled } : item))
      setPendingReload(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update MCP server.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(server: MCPServer) {
    setBusyId(server.id)
    setError(null)
    try {
      await deleteMCPServer(server.id)
      setServers((current) => current.filter((item) => item.id !== server.id))
      setPendingReload(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete MCP server.')
    } finally {
      setBusyId(null)
    }
  }

  async function reload() {
    setBusyId('reload')
    setError(null)
    try {
      const result = await reloadMCPServers()
      setStatuses(result.servers ?? [])
      setPendingReload(false)
      setTools(await fetchMCPTools())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload MCP runtime.')
    } finally {
      setBusyId(null)
    }
  }

  async function importLocalJson() {
    setBusyId('import')
    setError(null)
    try {
      await importMCPJson()
      setPendingReload(true)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import local mcp.json.')
    } finally {
      setBusyId(null)
    }
  }

  const statusByName = new Map(statuses.map((status) => [status.name, status]))

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}

      <section className="grid grid-cols-3 gap-2">
        {metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Runtime control</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">{pendingReload ? 'Changes are saved. Reload to apply them to agent tools.' : 'MCP runtime is in sync with the latest applied configuration.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <SoftButton onClick={() => void load()} disabled={loading}>Refresh</SoftButton>
          <SoftButton onClick={() => void importLocalJson()} disabled={busyId === 'import'}>Import mcp.json</SoftButton>
          <SoftButton tone="primary" onClick={() => void reload()} disabled={busyId === 'reload'}>{busyId === 'reload' ? 'Reloading...' : 'Apply and reload'}</SoftButton>
          <SoftButton tone="success" onClick={() => setEditing('new')}>Add server</SoftButton>
        </div>
      </section>

      {editing && (
        <MCPServerForm
          server={editing === 'new' ? undefined : editing}
          saving={busyId === (editing === 'new' ? 'new' : editing.id)}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      <section>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Configured servers</h2>
        <div className="mt-3 grid gap-2">
          {loading ? (
            <ProviderEmptyState label="Loading MCP servers..." />
          ) : servers.length === 0 ? (
            <ProviderEmptyState label="No MCP server configured yet. Add one or import your local mcp.json." />
          ) : servers.map((server) => (
            <MCPServerCard
              key={server.id}
              server={server}
              status={statusByName.get(server.name)}
              tools={tools[server.name]}
              busy={busyId === server.id}
              onToggle={(enabled) => void toggle(server, enabled)}
              onEdit={() => setEditing(server)}
              onDelete={() => void remove(server)}
            />
          ))}
        </div>
      </section>

      <MCPOrgCatalog onChanged={() => { setPendingReload(false); void load() }} />
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
