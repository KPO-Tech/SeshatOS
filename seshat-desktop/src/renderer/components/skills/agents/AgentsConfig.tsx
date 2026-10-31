import { useEffect, useMemo, useState } from 'react'
import { Plus } from '@icon-park/react'
import { ProviderEmptyState } from '@renderer/components/config/providers/ProviderEmptyState'
import { AgentCard, isReadOnly } from './AgentCard'
import { AgentCreateForm } from './AgentCreateForm'
import { createAgent, deleteAgent, fetchAgents, updateAgent } from './agentsApi'
import type { AgentConfigEntry, AgentCreatePayload } from './agentTypes'

/** Which agents are listed, by where they come from. */
export type AgentSource = 'all' | 'built-in' | 'organization' | 'custom'

type Props = {
  query: string
  sort: 'name' | 'status'
  source: AgentSource
  enabledOnly: boolean
  /** Tells the page which sources hold agents, for its filter. */
  onSources?: (sources: AgentSource[]) => void
}
type Message = { tone: 'ok' | 'error'; text: string }

function Banner({ message }: { message: Message }) {
  return (
    <div className={['mb-3 rounded-lg border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold', message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'].join(' ')}>
      {message.text}
    </div>
  )
}

/** The agents the assistant can be, as cards like the skills. The page owns the search, the sort and the filter. */
export function AgentsConfig({ query, sort, source, enabledOnly, onSources }: Props) {
  const [agents, setAgents] = useState<AgentConfigEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

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

  useEffect(() => {
    const present: AgentSource[] = ['built-in', 'organization', 'custom'].filter((id) =>
      agents.some((agent) => (id === 'custom' ? !isReadOnly(agent) : agent.source === id))
    ) as AgentSource[]
    onSources?.(present)
  }, [agents, onSources])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const listed = agents.filter((agent) => {
      if (enabledOnly && !agent.enabled) return false
      if (source === 'built-in' && agent.source !== 'built-in') return false
      if (source === 'organization' && agent.source !== 'organization') return false
      if (source === 'custom' && isReadOnly(agent)) return false
      return !needle || `${agent.name} ${agent.slug} ${agent.when_to_use ?? ''}`.toLowerCase().includes(needle)
    })
    const byName = (a: AgentConfigEntry, b: AgentConfigEntry) => (a.name || a.slug).localeCompare(b.name || b.slug)
    return [...listed].sort(sort === 'status' ? (a, b) => Number(b.enabled) - Number(a.enabled) || byName(a, b) : byName)
  }, [agents, query, source, sort, enabledOnly])

  async function toggleAgent(agent: AgentConfigEntry, enabled: boolean) {
    if (isReadOnly(agent)) {
      setMessage({ tone: 'error', text: 'Built-in and organization agents are read-only here.' })
      return
    }
    setBusySlug(agent.slug)
    setMessage(null)
    try {
      const updated = await updateAgent(agent.slug, { enabled })
      setAgents((current) => current.map((item) => (item.slug === agent.slug ? updated : item)))
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
      <div className="mt-4 w-full space-y-4">
        {message && <Banner message={message} />}
        <AgentCreateForm saving={Boolean(busySlug)} onCancel={() => setCreating(false)} onSubmit={(payload) => void handleCreate(payload)} />
      </div>
    )
  }

  const own = visible.filter((agent) => !isReadOnly(agent))
  const platform = visible.filter((agent) => isReadOnly(agent))
  const filtering = query.trim() !== '' || source !== 'all' || enabledOnly
  const grid = (items: AgentConfigEntry[]) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
      {items.map((agent) => (
        <AgentCard
          key={`${agent.source}-${agent.slug}`}
          agent={agent}
          busy={busySlug === agent.slug}
          onToggle={(item, enabled) => void toggleAgent(item, enabled)}
          onDelete={(item) => void handleDelete(item)}
        />
      ))}
    </div>
  )

  return (
    <div>
      {message && <div className="mt-4"><Banner message={message} /></div>}
      {loading ? (
        <div className="mt-6"><ProviderEmptyState label="Loading agents..." /></div>
      ) : (
        <>
          {(own.length > 0 || !filtering) && (
            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="m-0 flex items-center gap-2 text-[16px] font-semibold text-[var(--text-primary)]">
                  Your agents
                  <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--text-muted)]">{own.length}</span>
                </h2>
                <button type="button" onClick={() => setCreating(true)} className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90">
                  <Plus theme="outline" size={15} />
                  New agent
                </button>
              </div>
              {own.length > 0 ? (
                grid(own)
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border-strong)] px-5 py-6 text-center text-[12.5px] text-[var(--text-muted)]">
                  You have not made an agent yet. Create one with its own instructions, tools and limits.
                </div>
              )}
            </section>
          )}
          {platform.length > 0 && (
            <section className="mt-6">
              <h2 className="m-0 mb-3 flex items-center gap-2 text-[16px] font-semibold text-[var(--text-primary)]">
                Platform agents
                <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--text-muted)]">{platform.length}</span>
              </h2>
              {grid(platform)}
            </section>
          )}
          {own.length === 0 && platform.length === 0 && filtering && <div className="mt-6"><ProviderEmptyState label="No agents match your filters." /></div>}
        </>
      )}
    </div>
  )
}
