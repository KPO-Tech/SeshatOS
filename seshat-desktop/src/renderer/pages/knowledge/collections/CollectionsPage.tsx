import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Down, FolderOpen, Plus, Search, SortThree } from '@icon-park/react'
import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { useCanManageKnowledge } from '../useCanManage'
import { CollectionCard } from './CollectionCard'
import { CollectionDialog } from './CollectionDialog'
import { createCollection, indexCollection } from './collectionsApi'
import { plural } from './fileStatus'
import { IndexingNotice } from './IndexingNotice'
import { DEFAULT_SOURCE_ID } from './sourcesApi'
import { useCollectionList } from './useCollectionList'

type Sort = 'name' | 'recent'

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3'
const MADE_IN_APP = 'Made in the app'

function Count({ value, active }: { value: number; active?: boolean }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${active ? 'bg-white/25 text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{value}</span>
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

const BUTTON = 'flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold'

// The collections, in one list. A source filters them: the address says which (?source=), so the Sources page can open its own.
export function CollectionsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { collections, sources, loading, failed, indexingConfigured, reload } = useCollectionList()
  const { allowed: canManage } = useCanManageKnowledge()
  const [creating, setCreating] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('name')

  // The collections made in the app have no source id: it is the default source.
  const idOf = (sourceId: string) => (sourceId === DEFAULT_SOURCE_ID ? '' : sourceId)
  const countIn = (sourceId: string) => collections.filter((c) => c.sourceId === idOf(sourceId)).length

  const requested = params.get('source') ?? 'all'
  // A source that no longer exists falls back to all of them.
  const scope = requested === 'all' || requested === DEFAULT_SOURCE_ID || sources.some((s) => s.id === requested) ? requested : 'all'
  const setScope = (next: string) => setParams(next === 'all' ? {} : { source: next }, { replace: true })

  const needle = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      collections
        .filter((c) => (scope === 'all' || c.sourceId === idOf(scope)) && (!needle || `${c.name} ${c.description}`.toLowerCase().includes(needle)))
        .sort((a, b) => (sort === 'recent' ? b.updatedAt - a.updatedAt || a.name.localeCompare(b.name) : a.name.localeCompare(b.name))),
    [collections, scope, needle, sort]
  )

  const pills: Array<{ id: string; label: string; count: number }> = [
    { id: 'all', label: 'All', count: collections.length },
    { id: DEFAULT_SOURCE_ID, label: MADE_IN_APP, count: countIn(DEFAULT_SOURCE_ID) },
    ...sources.map((source) => ({ id: source.id, label: source.name, count: countIn(source.id) }))
  ]

  async function create(name: string, description: string) {
    const created = await createCollection(name, description)
    setCreating(false)
    await reload()
    navigate(`/knowledge/collections/${encodeURIComponent(created.id)}`)
  }

  async function indexAll() {
    setIndexing(true)
    setError(null)
    setNotice(null)
    try {
      let queued = 0
      for (const collection of shown) queued += await indexCollection(collection.id)
      setNotice(queued === 0 ? 'Nothing is waiting to be indexed.' : `${plural(queued, 'document', 'documents')} queued for indexing. Open a collection to follow it.`)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The indexing could not be started.')
    } finally {
      setIndexing(false)
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-5">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
            <FolderOpen theme="filled" size={24} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">Collections</h1>
            <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)]">The documents your agents can search, filtered by the source they come from.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && (
            <button type="button" onClick={() => navigate('/knowledge/sources')} className={`${BUTTON} border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]`}>
              Sources
            </button>
          )}
          {scope !== 'all' && shown.length > 0 && (
            <button type="button" onClick={() => void indexAll()} disabled={indexing} className={`${BUTTON} border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-60`}>
              {indexing ? 'Starting...' : 'Index everything'}
            </button>
          )}
          <button type="button" onClick={() => setCreating(true)} className={`${BUTTON} border-0 bg-[var(--accent-primary)] text-white hover:opacity-90`}>
            <Plus theme="outline" size={15} />
            New collection
          </button>
        </div>
      </div>

      <div className="relative mt-5 shrink-0">
        <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-[var(--text-muted)]">
          <Search theme="outline" size={16} />
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search collections..."
          className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-10 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        />
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Source" className="flex flex-wrap items-center gap-2">
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

      {(failed || error) && (
        <p className="mt-4 shrink-0 text-[12.5px] font-semibold text-[var(--accent-danger)]" role="alert">
          {error ?? 'The collections could not be read.'}
        </p>
      )}
      {notice && <p className="mt-4 shrink-0 text-[12.5px] text-[var(--text-secondary)]">{notice}</p>}
      {indexingConfigured === false && collections.length > 0 && (
        <div className="mt-4 shrink-0">
          <IndexingNotice />
        </div>
      )}

      <div className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pb-8">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>
        ) : failed ? null : shown.length === 0 ? (
          <p className="m-0 py-6 text-[13px] text-[var(--text-muted)]">
            {collections.length === 0 ? 'No collection yet. New collection makes one, and a folder added in Sources proposes its own.' : scope !== 'all' && !needle ? 'No collection in this source yet.' : 'No collection matches.'}
          </p>
        ) : (
          <div className={GRID}>
            {shown.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} onOpen={() => navigate(`/knowledge/collections/${encodeURIComponent(collection.id)}`)} />
            ))}
          </div>
        )}
      </div>

      {creating && <CollectionDialog title="New collection" submitLabel="Create" onSubmit={create} onClose={() => setCreating(false)} />}
    </section>
  )
}
