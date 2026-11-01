import { useState } from 'react'
import { ActionButton, SettingRow, StatusBadge, Toggle } from '../../settings/kit'
import { MCPServerIcon } from './MCPIcons'
import type { MCPServer, MCPToolEntry } from './mcpTypes'

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
        {status?.error && <StatusBadge tone="warn">Error</StatusBadge>}
        <ActionButton type="button" onClick={() => setExpanded((current) => !current)}>
          {toolCount} tools
        </ActionButton>
        <Toggle label={`Enable ${server.name}`} enabled={server.enabled} onChange={onToggle} />
        <ActionButton type="button" onClick={onEdit} disabled={busy}>
          Edit
        </ActionButton>
        <ActionButton type="button" tone="danger" onClick={onDelete} disabled={busy}>
          Delete
        </ActionButton>
      </SettingRow>
      {expanded && (
        <div className="grid gap-1.5 bg-[var(--surface-root)]/40 px-4 py-3">
          {tools && tools.length > 0 ? (
            tools.map((tool) => (
              <div key={tool.name} className="rounded-lg bg-[var(--surface-muted)] px-3 py-2">
                <div className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">{tool.name}</div>
                {tool.description && <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">{tool.description}</div>}
              </div>
            ))
          ) : (
            <div className="text-[12px] text-[var(--text-muted)]">No tools yet. Apply and reload.</div>
          )}
        </div>
      )}
    </>
  )
}
