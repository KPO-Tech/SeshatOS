import { Down } from '@icon-park/react'
import { useState } from 'react'
import { ActionButton, SettingRow, StatusBadge, Toggle } from '../../settings/kit'
import { MCPServerIcon } from './MCPIcons'
import { MCPToolList } from './MCPToolList'
import type { MCPServer, MCPToolEntry } from './mcpTypes'
import { useTranslation } from 'react-i18next'

/** One server as a row of its card: its name and command, the number of tools it gives, and its actions. */
export function MCPServerCard({
  server,
  status,
  tools,
  busy,
  onToggle,
  onEdit,
  onDelete
}: {
  server: MCPServer
  status?: { ok: boolean; error?: string; tools: number }
  tools?: MCPToolEntry[]
  busy: boolean
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('config')
  const [expanded, setExpanded] = useState(false)
  const toolCount = tools?.length ?? status?.tools ?? 0
  const command = server.server_type === 'stdio' ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ') : server.url

  return (
    <>
      <SettingRow
        title={server.display_name || server.name}
        hint={status?.error || command}
        icon={
          <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-muted)]">
            <MCPServerIcon icon={server.icon} type={server.server_type} />
          </span>
        }
      >
        {status?.error && <StatusBadge tone="warn">{t('mcp.mCPServerCard.error')}</StatusBadge>}
        <ActionButton type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
          {t('mcp.mcpServerCard.tools', { count: toolCount })}
          <Down size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </ActionButton>
        <Toggle label={t('mcp.mcpServerCard.enable', { name: server.name })} enabled={server.enabled} onChange={onToggle} />
        <ActionButton type="button" onClick={onEdit} disabled={busy}>
          {t('mcp.mCPServerCard.edit')}
        </ActionButton>
        <ActionButton type="button" tone="danger" onClick={onDelete} disabled={busy}>
          {t('mcp.mCPServerCard.delete')}
        </ActionButton>
      </SettingRow>
      {expanded && <MCPToolList tools={tools} />}
    </>
  )
}
