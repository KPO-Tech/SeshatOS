import { useEffect, useState } from 'react'
import { ActionButton, Notice, SettingRow, SettingsCard, SettingsPage, StatusBadge } from '../../settings/kit'
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

  const toolCount = servers.reduce((sum, server) => sum + (tools[server.name]?.length ?? 0), 0)
  const enabledCount = servers.filter((server) => server.enabled).length

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
    <SettingsPage
      id="mcp"
      badge={<StatusBadge tone={enabledCount > 0 ? 'ok' : 'muted'}>{`${enabledCount} on · ${toolCount} tools`}</StatusBadge>}
      actions={
        <>
          <ActionButton type="button" onClick={() => void importLocalJson()} disabled={busyId === 'import'}>
            Import mcp.json
          </ActionButton>
          <ActionButton type="button" tone={pendingReload ? 'primary' : 'default'} onClick={() => void reload()} disabled={busyId === 'reload'}>
            {busyId === 'reload' ? 'Reloading...' : pendingReload ? 'Apply changes' : 'Reload'}
          </ActionButton>
          <ActionButton type="button" tone="primary" onClick={() => setEditing('new')}>
            Add server
          </ActionButton>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}

      {editing && (
        <MCPServerForm
          server={editing === 'new' ? undefined : editing}
          saving={busyId === (editing === 'new' ? 'new' : editing.id)}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      <SettingsCard title="Servers">
        {!loading && servers.length === 0 && <SettingRow title="No server yet" hint="Add one or import your mcp.json." />}
        {servers.map((server) => (
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
      </SettingsCard>

      <MCPOrgCatalog
        onChanged={() => {
          setPendingReload(false)
          void load()
        }}
      />
    </SettingsPage>
  )
}
