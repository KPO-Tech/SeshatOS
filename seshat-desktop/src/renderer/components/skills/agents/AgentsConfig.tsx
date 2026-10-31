import { useEffect, useMemo, useState } from 'react'
import { Down, Plus, Search, SortThree } from '@icon-park/react'
import { ProviderEmptyState } from '@renderer/components/config/providers/ProviderEmptyState'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { AgentCard, isReadOnly } from './AgentCard'
import { AgentCreateForm } from './AgentCreateForm'
import { createAgent, deleteAgent, fetchAgents, updateAgent } from './agentsApi'
import type { AgentConfigEntry, AgentCreatePayload } from './agentTypes'

type Filter = 'all' | 'builtin' | 'organization' | 'custom'
type Message = { tone: 'ok' | 'error'; text: string }

function Banner({ message }: { message: Message }) {
  return (
    <div className={['mb-3 rounded-lg border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold', message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'].join(' ')}>
      {message.text}
    </div>
  )
}

/** The agents the assistant can be, laid out like the skills: a search, filters with their counts, a sort, and cards. */
export function AgentsConfig() {
  const [agents, setAgents] = useState<AgentConfigEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<'name' | 'status'>('name')

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

  const counts = useMemo(
    () => ({
      all: agents.length,
      builtin: agents.filter((agent) => agent.source === 'built-in').length,
      organization: agents.filter((agent) => agent.source === 'organization').length,
      custom: agents.filter((agent) => !isReadOnly(agent)).length
    }),
    [agents]
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const listed = agents.filter((agent) => {
      if (filter === 'builtin' && agent.source !== 'built-in') return false
      if (filter === 'organization' && agent.source !== 'organization') return false
      if (filter === 'custom' && isReadOnly(agent)) return false
      return !needle || `${agent.name} ${agent.slug} ${agent.when_to_use ?? ''}`.toLowerCase().includes(needle)
    })
    const byName = (a: AgentConfigEntry, b: AgentConfigEntry) => (a.name || a.slug).localeCompare(b.name || b.slug)
    return [...listed].sort(sort === 'status' ? (a, b) => Number(b.enabled) - Number(a.enabled) || byName(a, b) : byName)
  }, [agents, query, filter, sort])

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
      <div className="mx-auto mt-4 w-full max-w-[920px] space-y-5">
        {message && <Banner message={message} />}
        <AgentCreateForm saving={Boolean(busySlug)} onCancel={() => setCreating(false)} onSubmit={(payload) => void handleCreate(payload)} />
      </div>
    )
  }

  const pills: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: 'All agents', count: counts.all },
    { id: 'builtin', label: 'Built-in', count: counts.builtin },
    ...(counts.organization > 0 ? [{ id: 'organization' as const, label: 'Organization', count: counts.organization }] : []),
    { id: 'custom', label: 'Custom', count: counts.custom }
  ]
  const sortItems: DropdownItem[] = [
    { id: 'name', label: 'Name', checked: sort === 'name', onSelect: () => setSort('name') },
    { id: 'status', label: 'Status', checked: sort === 'status', onSelect: () => setSort('status') }
  ]

  return (
    <div>
      {message && <div className="mt-4"><Banner message={message} /></div>}

      <div className="mt-4 flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-[var(--text-muted)]">
            <Search theme="outline" size={16} />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search agents by name or purpose..."
            className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-10 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
        <button type="button" onClick={() => setCreating(true)} className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90">
          <Plus theme="outline" size={15} />
          New agent
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex flex-wrap items-center gap-2">
          {pills.map((pill) => (
            <button
              key={pill.id}
              type="button"
              role="tab"
              aria-selected={filter === pill.id}
              onClick={() => setFilter(pill.id)}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-medium ${filter === pill.id ? 'border-transparent bg-[var(--accent-primary)] text-white' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}
            >
              {pill.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${filter === pill.id ? 'bg-white/25 text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{pill.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <SortThree theme="outline" size={14} />
          Sort by
          <Dropdown
            label="Sort by"
            items={sortItems}
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
                {sort === 'name' ? 'Name' : 'Status'}
                <Down theme="outline" size={12} />
              </button>
            )}
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-4"><ProviderEmptyState label="Loading agents..." /></div>
      ) : visible.length === 0 ? (
        <div className="mt-4"><ProviderEmptyState label={agents.length === 0 ? 'No agents yet.' : 'No agents match your filters.'} /></div>
      ) : (
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 pb-2">
          {visible.map((agent) => (
            <AgentCard
              key={`${agent.source}-${agent.slug}`}
              agent={agent}
              busy={busySlug === agent.slug}
              onToggle={(item, enabled) => void toggleAgent(item, enabled)}
              onDelete={(item) => void handleDelete(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
