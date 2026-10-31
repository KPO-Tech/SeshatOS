import { CheckOne, More } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { AgentAvatar } from './AgentAvatar'
import type { AgentConfigEntry } from './agentTypes'

export const READ_ONLY_SOURCES = ['built-in', 'organization']

export function isReadOnly(agent: AgentConfigEntry): boolean {
  return READ_ONLY_SOURCES.includes(agent.source)
}

export function sourceLabel(source: string): string {
  if (source === 'built-in') return 'Built-in'
  if (source === 'organization') return 'Organization'
  if (source === 'workflow') return 'Workflow'
  return 'Custom'
}

function Switch({ enabled, disabled, label, onChange }: { enabled: boolean; disabled: boolean; label: string; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      title={disabled ? 'Built-in and organization agents are read-only' : undefined}
      onClick={() => onChange(!enabled)}
      className={`flex h-5 w-9 shrink-0 items-center rounded-full border-0 p-0.5 transition-colors ${enabled ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--surface-muted)]'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span className="size-4 rounded-full bg-white" />
    </button>
  )
}

function Chip({ children }: { children: string }) {
  return <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">{children}</span>
}

type Props = {
  agent: AgentConfigEntry
  busy: boolean
  onToggle: (agent: AgentConfigEntry, enabled: boolean) => void
  onDelete: (agent: AgentConfigEntry) => void
}

/** An agent as a card, laid out like a skill: who it is, what it is for, what it can use, and whether it is on. */
export function AgentCard({ agent, busy, onToggle, onDelete }: Props) {
  const readOnly = isReadOnly(agent)
  const editable = agent.source === 'user' || agent.source === 'workflow'
  const allTools = !agent.tools?.length || (agent.tools.length === 1 && agent.tools[0] === '*')
  const menu: DropdownItem[] = editable ? [{ id: 'delete', label: 'Delete', danger: true, onSelect: () => onDelete(agent) }] : []

  return (
    <article className={`flex min-w-0 flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4 ${agent.enabled ? '' : 'opacity-75'}`}>
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size={48} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-1.5">
            <h3 className="m-0 truncate text-[14px] font-semibold text-[var(--text-primary)]">{agent.name || agent.slug}</h3>
            {agent.source === 'built-in' && (
              <span className="shrink-0 text-[var(--accent-primary)]" title="Official">
                <CheckOne theme="filled" size={13} fill="currentColor" />
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">{sourceLabel(agent.source)}</div>
        </div>
        {menu.length > 0 && (
          <Dropdown
            label="More about this agent"
            items={menu}
            trigger={({ toggle }) => (
              <button type="button" aria-label="More about this agent" disabled={busy} onClick={toggle} className="flex size-7 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                <More theme="outline" size={14} />
              </button>
            )}
          />
        )}
      </div>

      <p className="m-0 mt-3 line-clamp-3 min-h-[57px] text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{agent.when_to_use || agent.system_prompt || 'No usage description yet.'}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{agent.model || 'Default model'}</Chip>
        <Chip>{allTools ? 'All tools' : `${agent.tools?.length ?? 0} tools`}</Chip>
        {agent.max_turns && agent.max_turns > 0 ? <Chip>{`${agent.max_turns} turns`}</Chip> : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-soft)] pt-3">
        <span className={`text-[12px] font-medium ${agent.enabled ? 'text-[var(--accent-success)]' : 'text-[var(--text-muted)]'}`}>{agent.enabled ? 'Enabled' : 'Off'}</span>
        <Switch enabled={agent.enabled} disabled={readOnly || busy} label={`Turn ${agent.name || agent.slug} ${agent.enabled ? 'off' : 'on'}`} onChange={(enabled) => onToggle(agent, enabled)} />
      </div>
    </article>
  )
}
