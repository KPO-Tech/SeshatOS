import { useState } from 'react'
import { SoftButton, StatusPill, ToggleSwitch } from '../knowledge/KnowledgePrimitives'
import { MCPServerIcon } from './MCPIcons'
import type { MCPServer, MCPToolEntry } from './mcpTypes'

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

  return (
    <article className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-muted)]">
            <MCPServerIcon icon={server.icon} type={server.server_type} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{server.display_name || server.name}</h3>
              <StatusPill tone={server.enabled ? 'ok' : 'muted'}>{server.enabled ? 'Enabled' : 'Disabled'}</StatusPill>
              <StatusPill tone={status?.ok ? 'ok' : status?.error ? 'warn' : 'muted'}>{server.server_type}</StatusPill>
              {server.source === 'file' && <StatusPill tone="muted">mcp.json</StatusPill>}
            </div>
            <p className="mt-1 truncate font-mono text-[11px] text-[var(--text-muted)]">
              {server.server_type === 'stdio' ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ') : server.url}
            </p>
            {status?.error && <p className="mt-2 text-[12px] font-semibold text-[var(--accent-danger)]">{status.error}</p>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setExpanded((current) => !current)} className="h-8 rounded-md border border-[var(--border-soft)] px-2.5 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
            {toolCount} tools
          </button>
          <ToggleSwitch enabled={server.enabled} onChange={onToggle} />
          <SoftButton onClick={onEdit} disabled={busy}>Edit</SoftButton>
          <SoftButton tone="danger" onClick={onDelete} disabled={busy}>Delete</SoftButton>
        </div>
      </div>

      {expanded && (
        <div className="grid gap-2 border-t border-[var(--border-soft)] p-3">
          {tools && tools.length > 0 ? tools.map((tool) => (
            <div key={tool.name} className="rounded-md bg-[var(--surface-muted)] px-3 py-2">
              <div className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">{tool.name}</div>
              {tool.description && <div className="mt-1 text-[11px] leading-[var(--leading-copy)] text-[var(--text-muted)]">{tool.description}</div>}
            </div>
          )) : (
            <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-muted)]">No tools loaded yet. Apply and reload to refresh runtime tools.</div>
          )}
        </div>
      )}
    </article>
  )
}
