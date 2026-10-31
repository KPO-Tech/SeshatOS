import type { ReactNode } from 'react'
import { Chip, More, Time, Tool } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { AgentAvatar } from './AgentAvatar'
import type { AgentConfigEntry } from './agentTypes'

const READ_ONLY_SOURCES = ['built-in', 'organization']

/** Built-in and organization agents are kept as they are: they can be read here, not changed. */
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
      className={`flex h-5 w-9 shrink-0 items-center rounded-full border-0 p-0.5 transition-colors ${enabled ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--surface-muted)]'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span className="size-4 rounded-full bg-white" />
    </button>
  )
}

function Badge({ tone, children }: { tone: 'ok' | 'muted'; children: string }) {
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${tone === 'ok' ? 'bg-[color-mix(in_srgb,var(--accent-success)_16%,transparent)] text-[var(--accent-success)]' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'}`}>
      {children}
    </span>
  )
}

function Fact({ icon, children }: { icon: ReactNode; children: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
      <span className="flex shrink-0 text-[var(--text-muted)]">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  )
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
    <article className="flex min-w-0 flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-start gap-3">
        <AgentAvatar agent={agent} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="m-0 max-w-full truncate text-[14px] font-semibold text-[var(--text-primary)]">{agent.name || agent.slug}</h3>
            <Badge tone={agent.enabled ? 'ok' : 'muted'}>{agent.enabled ? 'Enabled' : 'Off'}</Badge>
            <Badge tone="muted">{sourceLabel(agent.source)}</Badge>
          </div>
        </div>
        {menu.length > 0 && (
          <Dropdown
            label="More about this agent"
            items={menu}
            trigger={({ toggle }) => (
              <button type="button" aria-label="More about this agent" disabled={busy} onClick={toggle} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
                <More theme="outline" size={14} />
              </button>
            )}
          />
        )}
      </div>

      <p className="m-0 mt-3 line-clamp-3 min-h-[57px] text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{agent.when_to_use || agent.system_prompt || 'No usage description yet.'}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Fact icon={<Chip theme="outline" size={13} />}>{agent.model || 'Default'}</Fact>
        <Fact icon={<Tool theme="outline" size={13} />}>{allTools ? 'All tools' : `${agent.tools?.length ?? 0} tools`}</Fact>
        {agent.max_turns && agent.max_turns > 0 ? <Fact icon={<Time theme="outline" size={13} />}>{`${agent.max_turns} turns`}</Fact> : null}
      </div>

      <div className="mt-3 flex justify-end">
        <Switch enabled={agent.enabled} disabled={readOnly || busy} label={`Turn ${agent.name || agent.slug} ${agent.enabled ? 'off' : 'on'}`} onChange={(enabled) => onToggle(agent, enabled)} />
      </div>
    </article>
  )
}
