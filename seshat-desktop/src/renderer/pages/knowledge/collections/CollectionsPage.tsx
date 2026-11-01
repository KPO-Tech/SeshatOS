import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Down, FolderOpen, Plus, Search, SortThree } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { useDeviceMode } from '../useCanManage'
import { CollectionCard, KnowledgeCard, Tag } from './CollectionCard'
import { AddSourceDialog } from './AddSourceDialog'
import { plural } from './fileStatus'
import { SourceIcon } from './SourceIcon'
import { DEFAULT_SOURCE_ID, sourcePath } from './sourcesApi'
import { useCollectionList } from './useCollectionList'

type Sort = 'name' | 'recent'

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3'

function Count({ value, active }: { value: number; active?: boolean }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${active ? 'bg-white/25 text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{value}</span>
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-4">
      <h2 className="m-0 mb-3 flex items-center gap-2 text-[16px] font-semibold text-[var(--text-primary)]">
        {title}
        <Count value={count} />
      </h2>
      {children}
    </section>
  )
}

function Pick({ label, value, items }: { label: string; value: string; items: DropdownItem[] }) {
  return (
    <Dropdown
      label={label}
      items={items}
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
          {value}
          <Down theme="outline" size={12} />
        </button>
      )}
    />
  )
}

// The root of Collections: the sources the collections come from, and the collections themselves, laid out like the Skills page.
export function CollectionsPage() {
  const navigate = useNavigate()
  const { collections, sources, loading, failed, reload } = useCollectionList()
  const deviceMode = useDeviceMode()
  const [addingSource, setAddingSource] = useState(false)
  // Folder sources are kept on this computer: a device connected to an organization takes its collections from the organization's server.
  const canAddSource = deviceMode === 'standalone'

  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [sort, setSort] = useState<Sort>('name')

  // The collections made in the app have no source id: it is the default source, as on the page of a source.
  const idOf = (sourceId: string) => (sourceId === DEFAULT_SOURCE_ID ? '' : sourceId)
  const countIn = (sourceId: string) => collections.filter((c) => c.sourceId === idOf(sourceId)).length

  const needle = query.trim().toLowerCase()
  const showDefault = (scope === 'all' || scope === DEFAULT_SOURCE_ID) && (!needle || 'seshat'.includes(needle))
  const shownSources = sources.filter((s) => (scope === 'all' || scope === s.id) && (!needle || `${s.name} ${s.root}`.toLowerCase().includes(needle)))
  const sourceCount = (showDefault ? 1 : 0) + shownSources.length
  const matching = useMemo(
    () =>
      collections
        .filter((c) => (scope === 'all' || c.sourceId === idOf(scope)) && (!needle || `${c.name} ${c.description}`.toLowerCase().includes(needle)))
        .sort((a, b) => (sort === 'recent' ? b.updatedAt - a.updatedAt || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))),
    [collections, scope, needle, sort]
  )

  const pills: Array<{ id: string; label: string; count: number }> = [
    { id: 'all', label: 'All', count: collections.length },
    { id: DEFAULT_SOURCE_ID, label: 'Seshat', count: countIn(DEFAULT_SOURCE_ID) },
    ...sources.map((source) => ({ id: source.id, label: source.name, count: countIn(source.id) }))
  ]

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-5">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
            <FolderOpen theme="filled" size={24} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">Collections</h1>
            <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)]">The documents your agents can search, grouped by the source they come from.</p>
          </div>
        </div>
        {canAddSource && (
          <button type="button" onClick={() => setAddingSource(true)} className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90">
            <Plus theme="outline" size={15} />
            Add source
          </button>
        )}
      </div>

      <div className="relative mt-5 shrink-0">
        <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-[var(--text-muted)]">
          <Search theme="outline" size={16} />
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sources and collections..."
          className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-10 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex flex-wrap items-center gap-2">
          {pills.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={scope === item.id}
              onClick={() => setScope(item.id)}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-medium ${scope === item.id ? 'border-transparent bg-[var(--accent-primary)] text-white' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}
            >
              {item.label}
              <Count value={item.count} active={scope === item.id} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <SortThree theme="outline" size={14} />
          Sort by
          <Pick
            label="Sort by"
            value={sort === 'name' ? 'Name' : 'Recently updated'}
            items={[
              { id: 'name', label: 'Name', checked: sort === 'name', onSelect: () => setSort('name') },
              { id: 'recent', label: 'Recently updated', checked: sort === 'recent', onSelect: () => setSort('recent') }
            ]}
          />
        </div>
      </div>

      {failed && (
        <p className="mt-4 shrink-0 text-[12.5px] font-semibold text-[var(--accent-danger)]" role="alert">
          The collections could not be read.
        </p>
      )}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-8">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>
        ) : failed ? null : (
          <>
            {sourceCount > 0 && (
              <Section title="Sources" count={sourceCount}>
                <div className={GRID}>
                  {showDefault && (
                    <KnowledgeCard
                      icon={<SeshatLogo size={22} />}
                      title="Seshat"
                      subtitle={plural(countIn(DEFAULT_SOURCE_ID), 'collection', 'collections')}
                      description="The collections made and filled in the app."
                      footer={<Tag>On this computer</Tag>}
                      onOpen={() => navigate(sourcePath(DEFAULT_SOURCE_ID))}
                    />
                  )}
                  {shownSources.map((source) => (
                    <KnowledgeCard
                      key={source.id}
                      icon={<SourceIcon icon={source.icon} />}
                      title={source.name}
                      subtitle={plural(countIn(source.id), 'collection', 'collections')}
                      description={source.root}
                      footer={<Tag>Folder</Tag>}
                      onOpen={() => navigate(sourcePath(source.id))}
                    />
                  ))}
                </div>
              </Section>
            )}
            <Section title="Collections" count={matching.length}>
              {matching.length === 0 ? (
                <p className="m-0 py-6 text-[13px] text-[var(--text-muted)]">{collections.length === 0 ? 'No collection yet. Open a source to make one.' : 'No collection matches.'}</p>
              ) : (
                <div className={GRID}>
                  {matching.map((collection) => (
                    <CollectionCard key={collection.id} collection={collection} onOpen={() => navigate(`/knowledge/collections/${encodeURIComponent(collection.id)}`)} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>

      {addingSource && (
        <AddSourceDialog
          onClose={() => setAddingSource(false)}
          onAdded={async () => {
            setAddingSource(false)
            await reload()
          }}
        />
      )}
    </section>
  )
}
