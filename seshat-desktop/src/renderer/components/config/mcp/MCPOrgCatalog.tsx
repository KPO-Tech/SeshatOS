import { useEffect, useState } from 'react'
import { ActionButton, Notice, SettingRow, SettingsCard, StatusBadge } from '../../settings/kit'
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
    <>
      {error && <Notice tone="error">{error}</Notice>}
      <SettingsCard title="Organization catalog">
        {entries.map((entry) => (
          <SettingRow
            key={entry.id}
            title={entry.display_name || entry.name}
            hint={entry.server_type === 'stdio' ? [entry.command, ...(entry.args ?? [])].filter(Boolean).join(' ') : entry.url}
            icon={<MCPServerIcon icon={entry.icon} type={entry.server_type} />}
          >
            <StatusBadge tone={entry.approved ? 'ok' : 'muted'}>{entry.approved ? 'Approved' : 'Pending'}</StatusBadge>
            <ActionButton type="button" tone={entry.approved ? 'default' : 'primary'} onClick={() => void toggle(entry)} disabled={busyId === entry.id}>
              {entry.approved ? 'Revoke' : 'Approve'}
            </ActionButton>
          </SettingRow>
        ))}
      </SettingsCard>
    </>
  )
}
