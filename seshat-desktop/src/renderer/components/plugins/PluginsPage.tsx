import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Application, Down, ListView, Plus, Right, Search, SortThree, Plug } from '@icon-park/react'
import { MCPServerIcon } from '@renderer/components/config/mcp/MCPIcons'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { ToastStack, useToast } from '@renderer/components/ui/Toast'
import { tagsFor } from '@renderer/components/skills/skillIcons'
import { openInAppBrowser } from '@renderer/lib/openInAppBrowser'
import { edition } from '@renderer/lib/edition'
import { useDialogsStore } from '@renderer/stores/dialogs'
import { disconnectLocalConnector, type LocalConnector } from './api/localConnectorsApi'
import { categoryDescription, groupConnectors, matchesQuery } from './connectorGroups'
import { PluginTile, type PluginState } from './PluginTile'
import { McpInstallDialog } from './McpInstallDialog'
import { availableMcp, type McpCatalogEntry } from './mcpCatalog'
import { PluginDetailModal } from './PluginDetailModal'
import { useLocalConnectors } from './useLocalConnectors'

const CREATE_ENTRIES = ['Custom MCP', 'Import MCP by JSON', 'Add MCP by URL']
const PREVIEW = 3
const MCP = 'mcp'

type Sort = 'name' | 'status'
type Layout = 'grid' | 'list'
type Item = { id: string; title: string; description: string; state: PluginState; tags: string[]; render: (layout: Layout) => ReactNode }

function Count({ value, active }: { value: number; active?: boolean }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${active ? 'bg-white/25 text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{value}</span>
}

function Section({ title, count, description, action, children }: { title: string; count: number; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 flex items-center gap-2 text-[16px] font-semibold text-[var(--text-primary)]">
            {title}
            <Count value={count} />
          </h2>
          <p className="m-0 mt-1 text-[12.5px] text-[var(--text-muted)]">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const statusRank = (state: PluginState) => (state === 'attention' ? 0 : state === 'installed' ? 1 : 2)

export function PluginsPage() {
  const state = useLocalConnectors()
  const navigate = useNavigate()
  const openConfig = useDialogsStore((store) => store.openConfig)
  const { toasts, show } = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [layout, setLayout] = useState<Layout>('grid')
  const [openId, setOpenId] = useState<string | null>(null)
  const [installingMcp, setInstallingMcp] = useState<McpCatalogEntry | null>(null)

  const openConnector = state.connectors.find((connector) => connector.kind === openId) ?? null

  async function disconnect(connector: LocalConnector) {
    if (!window.confirm(`Disconnect ${connector.label}? The key is forgotten and its tools leave your agents.`)) return
    try {
      await disconnectLocalConnector(connector.kind)
      await state.reload()
    } catch (err) {
      show(err instanceof Error ? err.message : `Could not disconnect ${connector.label}.`, 'err')
    }
  }

  function connectorItem(connector: LocalConnector): Item {
    const connected = connector.status !== 'disconnected'
    const pluginState: PluginState = connector.status === 'error' ? 'attention' : connected ? 'installed' : 'available'
    const menu: DropdownItem[] = [
      { id: 'details', label: connected ? 'Configure' : 'Install', onSelect: () => setOpenId(connector.kind) },
      ...(connector.docs_url ? [{ id: 'docs', label: 'Open the documentation', onSelect: () => openInAppBrowser(connector.docs_url ?? '') }] : []),
      ...(connected ? [{ id: 'disconnect', label: 'Disconnect', danger: true, onSelect: () => void disconnect(connector) }] : [])
    ]
    const tags = tagsFor({ name: connector.kind, display_name: connector.label, description: connector.description }, 5)
    return {
      id: connector.kind,
      title: connector.label,
      description: connector.description,
      state: pluginState,
      tags,
      render: (shape) => <PluginTile key={connector.kind} title={connector.label} description={connector.description} brand={connector.kind} state={pluginState} tags={tags} menu={menu} layout={shape} onOpen={() => setOpenId(connector.kind)} />
    }
  }

  const needle = query.trim().toLowerCase()
  const groups = useMemo(() => groupConnectors(state.connectors.filter((connector) => matchesQuery(connector, query))), [state.connectors, query])
  const allGroups = useMemo(() => groupConnectors(state.connectors), [state.connectors])
  const mcpServers = useMemo(() => state.mcpServers.filter((server) => !needle || `${server.display_name ?? ''} ${server.name}`.toLowerCase().includes(needle)), [state.mcpServers, needle])

  const sorted = (items: Item[]) => [...items].sort(sort === 'status' ? (a, b) => statusRank(a.state) - statusRank(b.state) || a.title.localeCompare(b.title) : (a, b) => a.title.localeCompare(b.title))

  const mcpItems: Item[] = mcpServers.map((server) => {
    const title = server.display_name || server.name
    const description = server.url || [server.command, ...(server.args ?? [])].filter(Boolean).join(' ') || 'MCP server'
    const pluginState: PluginState = server.enabled ? 'installed' : 'available'
    return {
      id: `mcp:${server.id}`,
      title,
      description,
      state: pluginState,
      tags: [server.server_type],
      render: (shape) => (
        <PluginTile
          key={server.id}
          title={title}
          description={description}
          icon={<MCPServerIcon icon={server.icon} type={server.server_type} size={shape === 'grid' ? 52 : 40} />}
          state={pluginState}
          offLabel="Off"
          tags={[server.server_type]}
          menu={[{ id: 'configure', label: 'Configure', onSelect: () => openConfig('mcp') }]}
          layout={shape}
          onOpen={() => openConfig('mcp')}
        />
      )
    }
  })

  const offeredMcp = useMemo(
    () => availableMcp(state.mcpServers).filter((entry) => !needle || `${entry.title} ${entry.description} ${entry.category}`.toLowerCase().includes(needle)),
    [state.mcpServers, needle]
  )
  const catalogItems: Item[] = offeredMcp.map((entry) => ({
    id: `mcp-catalog:${entry.name}`,
    title: entry.title,
    description: entry.description,
    state: 'available',
    tags: entry.tags,
    render: (shape) => (
      <PluginTile
        key={`mcp-catalog:${entry.name}`}
        title={entry.title}
        description={entry.description}
        icon={
          <span className="flex shrink-0 items-center justify-center rounded-[10px] border border-[var(--border-soft)] bg-[var(--surface-muted)] text-[22px]" style={{ width: shape === 'grid' ? 52 : 40, height: shape === 'grid' ? 52 : 40 }} aria-hidden="true">
            {entry.icon}
          </span>
        }
        state="available"
        tags={entry.tags}
        menu={[{ id: 'docs', label: 'Read about it', onSelect: () => openInAppBrowser(entry.docs) }]}
        layout={shape}
        onOpen={() => setInstallingMcp(entry)}
      />
    )
  }))
  const allMcpItems = [...mcpItems, ...catalogItems]

  const pills = [
    { id: 'all', label: 'All', count: state.connectors.length + state.mcpServers.length + availableMcp(state.mcpServers).length },
    ...allGroups.map((group) => ({ id: group.id, label: group.label, count: group.connectors.length })),
    { id: MCP, label: 'MCP servers', count: state.mcpServers.length + availableMcp(state.mcpServers).length }
  ]

  const visibleGroups = groups.filter((group) => filter === 'all' || filter === group.id)
  const showMcp = filter === 'all' || filter === MCP
  const nothing = !state.loading && visibleGroups.length === 0 && (!showMcp || (allMcpItems.length === 0 && needle !== ''))
  const frame = (items: Item[]) => (
    <div className={layout === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3' : 'grid gap-2'}>{sorted(items).map((item) => item.render(layout))}</div>
  )

  const viewAll = (id: string) => (
    <button type="button" onClick={() => setFilter(id)} className="flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-medium text-[var(--accent-primary)] hover:underline">
      View all
      <Right theme="outline" size={13} />
    </button>
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-5">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
            <Plug theme="filled" size={24} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">Plugins</h1>
            <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)]">Connect SeshatOS to your tools and services. Extend its capabilities and automate your workflows.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {edition.store && (
            <button type="button" onClick={() => navigate('/store')} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
              <Application theme="outline" size={15} />
              Explore marketplace
            </button>
          )}
          <Dropdown
            label="Create"
            items={CREATE_ENTRIES.map((label) => ({ id: label, label, onSelect: () => openConfig('mcp') }))}
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90">
                <Plus theme="outline" size={15} />
                Create
                <Down theme="outline" size={12} />
              </button>
            )}
          />
        </div>
      </div>

      <div className="relative mt-5 shrink-0">
        <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-[var(--text-muted)]">
          <Search theme="outline" size={16} />
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search plugins by name, description or category..."
          className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-10 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
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
              <Count value={pill.count} active={filter === pill.id} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <SortThree theme="outline" size={14} />
          Sort by
          <Dropdown
            label="Sort by"
            items={[
              { id: 'name', label: 'Name', checked: sort === 'name', onSelect: () => setSort('name') },
              { id: 'status', label: 'Status', checked: sort === 'status', onSelect: () => setSort('status') }
            ]}
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
                {sort === 'name' ? 'Name' : 'Status'}
                <Down theme="outline" size={12} />
              </button>
            )}
          />
          <div className="ml-1 flex rounded-lg border border-[var(--border-soft)] p-0.5" role="group" aria-label="Layout">
            {([['grid', Application, 'Grid'], ['list', ListView, 'List']] as const).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                aria-label={label}
                aria-pressed={layout === id}
                onClick={() => setLayout(id)}
                className={`flex size-7 cursor-pointer items-center justify-center rounded-md border-0 ${layout === id ? 'bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              >
                <Icon theme="outline" size={15} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-8">
        {state.loading ? (
          <div className="flex items-center justify-center py-16 text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>
        ) : nothing ? (
          <div className="flex items-center justify-center py-16 text-[13px] font-semibold text-[var(--text-muted)]">No plugins match your search.</div>
        ) : (
          <>
            {visibleGroups.map((group) => {
              const items = group.connectors.map(connectorItem)
              const shown = filter === 'all' ? sorted(items).slice(0, PREVIEW) : items
              return (
                <Section key={group.id} title={group.label} count={items.length} description={categoryDescription(group.id)} action={filter === 'all' && items.length > PREVIEW ? viewAll(group.id) : undefined}>
                  {frame(shown)}
                </Section>
              )
            })}
            {showMcp && (
              <Section title="MCP servers" count={allMcpItems.length} description="Extra tools your agents can call via the Model Context Protocol (MCP).">
                {allMcpItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] px-5 py-8 text-center">
                    <span className="text-[var(--text-muted)]">
                      <Plug theme="outline" size={22} />
                    </span>
                    <div className="text-[14px] font-semibold text-[var(--text-primary)]">No MCP servers yet</div>
                    <p className="m-0 text-[12.5px] text-[var(--text-muted)]">Add an MCP server to give your agents access to external tools and services.</p>
                    <button type="button" onClick={() => openConfig('mcp')} className="mt-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90">
                      <Plus theme="outline" size={15} />
                      Create MCP server
                    </button>
                  </div>
                ) : (
                  frame(allMcpItems)
                )}
              </Section>
            )}
          </>
        )}
      </div>

      {installingMcp && (
        <McpInstallDialog
          entry={installingMcp}
          onInstalled={(started) => {
            void state.reload()
            show(started ? `${installingMcp.title} installed.` : `${installingMcp.title} installed, but it did not start.`, started ? 'ok' : 'err')
          }}
          onClose={() => setInstallingMcp(null)}
        />
      )}
      {openConnector && <PluginDetailModal connector={openConnector} onChanged={() => void state.reload()} onClose={() => setOpenId(null)} />}
      <ToastStack toasts={toasts} />
    </section>
  )
}
