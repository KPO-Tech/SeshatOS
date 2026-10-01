import { SoftButton, StatusPill, ToggleSwitch } from '../knowledge/KnowledgePrimitives'
import { AgentAvatar } from './AgentAvatar'
import type { AgentConfigEntry } from './agentTypes'

export function AgentCard({ agent, busy, onToggle, onDelete }: {
  agent: AgentConfigEntry
  busy: boolean
  onToggle: (agent: AgentConfigEntry, enabled: boolean) => void
  onDelete: (agent: AgentConfigEntry) => void
}) {
  const editable = agent.source === 'user' || agent.source === 'workflow'
  const allTools = !agent.tools?.length || (agent.tools.length === 1 && agent.tools[0] === '*')

  return (
    <article className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <AgentAvatar agent={agent} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{agent.name || agent.slug}</h3>
              <StatusPill tone={agent.enabled ? 'ok' : 'muted'}>{agent.enabled ? 'Enabled' : 'Disabled'}</StatusPill>
              <StatusPill tone="muted">{sourceLabel(agent.source)}</StatusPill>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
              {agent.when_to_use || agent.system_prompt || 'No usage description yet.'}
            </p>
          </div>
        </div>
        <ToggleSwitch enabled={agent.enabled} onChange={(enabled) => onToggle(agent, enabled)} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
        <Info label="Model" value={agent.model || 'Default'} />
        <Info label="Tools" value={allTools ? 'All tools' : String(agent.tools?.length ?? 0)} />
        <Info label="Turns" value={agent.max_turns && agent.max_turns > 0 ? String(agent.max_turns) : 'Default'} />
      </div>

      {editable && (
        <div className="mt-3 flex justify-end">
          <SoftButton tone="danger" disabled={busy} onClick={() => onDelete(agent)}>Delete</SoftButton>
        </div>
      )}
    </article>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2.5 py-2">
      <div className="text-[10px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 truncate font-semibold text-[var(--text-secondary)]">{value}</div>
    </div>
  )
}

function sourceLabel(source: string) {
  if (source === 'built-in') return 'Built in'
  if (source === 'organization') return 'Organization'
  if (source === 'workflow') return 'Workflow'
  return 'Custom'
}
