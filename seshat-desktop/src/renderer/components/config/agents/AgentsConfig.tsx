import { useEffect, useMemo, useState } from 'react'
import { ConfigCard, SoftButton, StatusPill } from '../knowledge/KnowledgePrimitives'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import { AgentCard } from './AgentCard'
import { AgentCreateForm } from './AgentCreateForm'
import { createAgent, deleteAgent, fetchAgents, updateAgent } from './agentsApi'
import type { AgentConfigEntry, AgentCreatePayload } from './agentTypes'

export function AgentsConfig() {
  const [agents, setAgents] = useState<AgentConfigEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    setMessage(null)
    try {
      setAgents(await fetchAgents())
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load agents.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const groups = useMemo(() => ({
    Platform: agents.filter((agent) => agent.source === 'built-in' || agent.source === 'organization'),
    Local: agents.filter((agent) => agent.source !== 'built-in' && agent.source !== 'organization')
  }), [agents])

  async function toggleAgent(agent: AgentConfigEntry, enabled: boolean) {
    if (agent.source === 'built-in' || agent.source === 'organization') {
      setMessage({ tone: 'error', text: 'Built-in and organization agents are read-only here.' })
      return
    }
    setBusySlug(agent.slug)
    setMessage(null)
    try {
      const updated = await updateAgent(agent.slug, { enabled })
      setAgents((current) => current.map((item) => item.slug === agent.slug ? updated : item))
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to update agent.' })
    } finally {
      setBusySlug(null)
    }
  }

  async function handleCreate(payload: AgentCreatePayload) {
    setBusySlug(payload.slug)
    setMessage(null)
    try {
      const created = await createAgent(payload)
      setAgents((current) => [...current, created])
      setCreating(false)
      setMessage({ tone: 'ok', text: 'Agent created.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to create agent.' })
    } finally {
      setBusySlug(null)
    }
  }

  async function handleDelete(agent: AgentConfigEntry) {
    setBusySlug(agent.slug)
    setMessage(null)
    try {
      await deleteAgent(agent.slug)
      setAgents((current) => current.filter((item) => item.slug !== agent.slug))
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to delete agent.' })
    } finally {
      setBusySlug(null)
    }
  }

  if (creating) {
    return (
      <div className="space-y-5">
        {message && (
          <div className={[
            'rounded-lg border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold',
            message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'
          ].join(' ')}>
            {message.text}
          </div>
        )}
        <AgentCreateForm saving={Boolean(busySlug)} onCancel={() => setCreating(false)} onSubmit={(payload) => void handleCreate(payload)} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {message && (
        <div className={[
          'rounded-lg border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold',
          message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'
        ].join(' ')}>
          {message.text}
        </div>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Metric label="Agents" value={String(agents.length)} />
        <Metric label="Enabled" value={String(agents.filter((agent) => agent.enabled).length)} />
        <Metric label="Local profiles" value={String(groups.Local.length)} />
      </section>

      <ConfigCard
        title="Agent profiles"
        description="Manage the local and shared agent profiles that can be selected by chat, tools, and automation."
        status={<StatusPill tone="muted">Backend linked</StatusPill>}
        action={<SoftButton tone="primary" onClick={() => setCreating(true)}>New agent</SoftButton>}
      >
        <p className="text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
          Built-in and organization agents stay read-only in this config panel. Custom profiles can be created here, then edited more deeply in the future agent workspace.
        </p>
      </ConfigCard>

      {loading ? (
        <ProviderEmptyState label="Loading agents..." />
      ) : (
        <>
          {Object.entries(groups).map(([group, items]) => (
            <section key={group}>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{group}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {items.length === 0 ? (
                  <ProviderEmptyState label={group === 'Local' ? 'No local agents yet.' : 'No platform agents available.'} />
                ) : (
                  items.map((agent) => (
                    <AgentCard
                      key={`${agent.source}-${agent.slug}`}
                      agent={agent}
                      busy={busySlug === agent.slug}
                      onToggle={(item, enabled) => void toggleAgent(item, enabled)}
                      onDelete={(item) => void handleDelete(item)}
                    />
                  ))
                )}
              </div>
            </section>
          ))}
        </>
      )}
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
