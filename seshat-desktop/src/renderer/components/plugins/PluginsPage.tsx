import { useEffect, useMemo, useRef, useState } from 'react'
import { MCPServerIcon } from '@renderer/components/config/mcp/MCPIcons'
import { useDialogsStore } from '@renderer/stores/dialogs'
import { PLUGIN_CATEGORIES, availableSources, matchesQuery, pluginsFor, type PluginCategory, type PluginDefinition } from './catalog/pluginCatalog'
import { PluginCard } from './PluginCard'
import { PluginDetailModal } from './PluginDetailModal'
import { isHealthy } from './pluginsTypes'
import { usePluginAccounts } from './usePluginAccounts'

const CREATE_ENTRIES = ['Custom MCP', 'Import MCP by JSON', 'Add MCP by URL']

type Filter = 'all' | PluginCategory | 'mcp'

export function PluginsPage() {
  const state = usePluginAccounts()
  const openConfig = useDialogsStore((store) => store.openConfig)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const createRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!createOpen) return
    const close = (event: MouseEvent) => {
      if (!createRef.current?.contains(event.target as Node)) setCreateOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [createOpen])

  const plugins = useMemo(() => pluginsFor(state.organization).filter((plugin) => matchesQuery(plugin, query)), [state.organization, query])
  const mcpServers = useMemo(
    () => state.mcpServers.filter((server) => `${server.display_name ?? ''} ${server.name}`.toLowerCase().includes(query.trim().toLowerCase())),
    [state.mcpServers, query]
  )
  const openPlugin = plugins.find((plugin) => plugin.id === openId) ?? null

  function statusOf(plugin: PluginDefinition) {
    const accounts = availableSources(plugin, state.organization).flatMap((source) => state.accountsFor(source))
    return { connected: accounts.length > 0, needsAttention: accounts.some((account) => !isHealthy(account)) }
  }

  const visibleCategories = PLUGIN_CATEGORIES.filter((category) => filter === 'all' || filter === category.id)
  const showMcp = filter === 'all' || filter === 'mcp'
  const nothing = !state.loading && plugins.length === 0 && mcpServers.length === 0

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-[18px] font-semibold text-[var(--text-primary)]">Plugins</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openConfig('connectors')}
            className="h-7 rounded-lg border border-[var(--border-soft)] px-3 text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
          >
            Manage Connectors
          </button>
          <div ref={createRef} className="relative">
            <button
              type="button"
              onClick={() => setCreateOpen((value) => !value)}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--border-soft)] px-3 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
            >
              Create
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {createOpen && (
              <div className="absolute right-0 top-10 z-20 w-56 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-1.5 shadow-xl">
                <div className="px-3 py-1.5 text-[12px] font-semibold text-[var(--text-muted)]">MCP servers</div>
                {CREATE_ENTRIES.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setCreateOpen(false)
                      openConfig('mcp')
                    }}
                    className="flex h-9 w-full items-center rounded-lg px-3 text-left text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative mt-3 shrink-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search plugins"
          className="h-9 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-9 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      <div className="no-scrollbar mt-3 flex shrink-0 gap-1.5 overflow-x-auto">
        {([{ id: 'all', label: 'All' }, ...PLUGIN_CATEGORIES, { id: 'mcp', label: 'MCP servers' }] as Array<{ id: Filter; label: string }>).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={['h-7 shrink-0 rounded-full px-3 text-[12px] font-semibold transition-colors', filter === item.id ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </div>

      {state.loading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>
      ) : nothing ? (
        <div className="flex flex-1 items-center justify-center pb-16 text-[13px] font-semibold text-[var(--text-muted)]">No plugins match your search.</div>
      ) : (
        <div className="no-scrollbar mt-5 min-h-0 flex-1 space-y-7 overflow-y-auto pb-8">
          {visibleCategories.map((category) => {
            const items = plugins.filter((plugin) => plugin.category === category.id)
            if (items.length === 0) return null
            return (
              <div key={category.id}>
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">{category.label}</h2>
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-2.5">
                  {items.map((plugin) => (
                    <PluginCard key={plugin.id} title={plugin.title} description={plugin.description} brand={plugin.brand} {...statusOf(plugin)} onOpen={() => setOpenId(plugin.id)} />
                  ))}
                </div>
              </div>
            )
          })}

          {showMcp && (
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">MCP servers</h2>
              <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">Extra tools your agents can call. Add one with Create.</p>
              {mcpServers.length === 0 ? (
                <p className="mt-3 text-[13px] text-[var(--text-muted)]">No MCP servers yet.</p>
              ) : (
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-2.5">
                  {mcpServers.map((server) => (
                    <PluginCard
                      key={server.id}
                      title={server.display_name || server.name}
                      description={server.url || [server.command, ...(server.args ?? [])].filter(Boolean).join(' ') || 'MCP server'}
                      icon={<MCPServerIcon icon={server.icon} type={server.server_type} size={34} />}
                      connected={server.enabled}
                      onOpen={() => openConfig('mcp')}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {openPlugin && <PluginDetailModal plugin={openPlugin} state={state} onClose={() => setOpenId(null)} />}
    </section>
  )
}
