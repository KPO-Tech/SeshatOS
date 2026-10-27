import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Message, Search } from '@icon-park/react'
import { useUIStore } from '@renderer/stores/ui'
import { useCollections, type AskScope } from '../chat/useCollections'
import { openDocument } from '../collections/openDocument'
import { ScopeSelect } from '../components/ScopeSelect'
import { DocumentDetails } from './DocumentDetails'
import { FilterPanel } from './FilterPanel'
import { queryTerms } from './highlight'
import { ResultRow, type View } from './ResultRow'
import { MAX_PASSAGES } from './searchApi'
import { SearchBar } from './SearchBar'
import { countLabel, facetsOf, filterDocs, groupDocs, KIND_LABEL, NO_FILTERS, sortDocs, withListing, type Doc, type Filters, type SortKey } from './searchModel'
import { useLibrary } from './useLibrary'
import { useSearch } from './useSearch'

const CARD = 'rounded-[20px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))]'

export function SearchPage() {
  const navigate = useNavigate()
  const { collections, failed: collectionsFailed } = useCollections()
  const library = useLibrary()
  const { state, run } = useSearch()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<AskScope>({ collectionId: null })
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey | null>(null)
  const [view, setView] = useState<View>('list')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  // The viewer takes the right of the screen when a document is open: the details give it the room.
  const viewerOpen = useUIStore((s) => s.rightColumns.length > 0)

  const searching = state.phase === 'loading' || state.phase === 'done' || state.phase === 'failed'
  const done = state.phase === 'done'
  const terms = useMemo(() => queryTerms(state.phase === 'idle' ? '' : state.query), [state])
  // After a search, the documents it found; before, every document there is (in the collection chosen, if one is).
  const base = useMemo<Doc[]>(() => {
    if (state.phase === 'done') return withListing(groupDocs(state.hits), library.docs)
    return scope.collectionId ? library.docs.filter((doc) => doc.corpusId === scope.collectionId) : library.docs
  }, [state, library.docs, scope.collectionId])
  // Each list counts the documents the other one leaves: the collections under the kind chosen, the kinds under the collections chosen.
  const inCollections = useMemo(() => filterDocs(base, { ...filters, kind: null }), [base, filters])
  const ofKind = useMemo(() => filterDocs(base, { ...filters, collectionIds: new Set() }), [base, filters])
  const facets = useMemo(() => ({ collections: facetsOf(ofKind).collections, kinds: facetsOf(inCollections).kinds }), [ofKind, inCollections])
  const sortKey: SortKey = sort ?? (done ? 'relevance' : 'recent')
  const shown = useMemo(() => sortDocs(filterDocs(base, filters), sortKey), [base, filters, sortKey])
  const selected = shown.find((doc) => doc.key === selectedKey) ?? null
  const scopeName = collections.find((item) => item.id === scope.collectionId)?.name ?? null

  // A new search, or a new collection to browse, starts from every document again.
  useEffect(() => {
    setFilters(NO_FILTERS)
    setSelectedKey(null)
    setOpenError(null)
    setSort(null)
  }, [state.phase === 'done' ? state.query : null, scope.collectionId])

  const submit = () => void run(query, scope.collectionId)

  const toggleCollection = (id: string) =>
    setFilters((current) => {
      const next = new Set(current.collectionIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...current, collectionIds: next }
    })

  async function open(doc: Doc, page?: number) {
    setOpenError(null)
    try {
      if (!(await openDocument({ fileId: doc.fileId, name: doc.path }, doc.corpusId, page))) setOpenError(`There is no preview for this kind of file yet: ${doc.name}`)
    } catch {
      setOpenError(`${doc.name} could not be opened.`)
    }
  }

  const sortOptions: [SortKey, string][] = done
    ? [
        ['relevance', 'Most relevant'],
        ['recent', 'Recently added'],
        ['name', 'Name']
      ]
    : [
        ['recent', 'Recently added'],
        ['name', 'Name']
      ]

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-6">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4">
        <section className={`${CARD} p-5`}>
          {!searching && (
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[16px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
                  <Search size={24} />
                </span>
                <div className="min-w-0">
                  <h1 className="m-0 text-[22px] font-semibold leading-[1.2] text-[var(--text-primary)]">Search knowledge</h1>
                  <p className="m-0 mt-1 text-[13.5px] text-[var(--text-muted)]">Find the documents and the passages that answer you, across all your collections.</p>
                </div>
              </div>
              <ScopeSelect collections={collections} scope={scope} onChange={setScope} placement="down" />
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <SearchBar value={query} busy={state.phase === 'loading'} autoFocus onChange={setQuery} onSubmit={submit} />
            </div>
            {searching && <ScopeSelect collections={collections} scope={scope} onChange={setScope} placement="down" />}
          </div>

          {(base.length > 0) && (
            <div role="tablist" aria-label="Kind of document" className="mt-4 flex flex-wrap gap-2">
              <KindTab label="All" count={inCollections.length} active={filters.kind === null} onClick={() => setFilters({ ...filters, kind: null })} />
              {facets.kinds.map(({ kind }) => (
                <KindTab
                  key={kind}
                  label={KIND_LABEL[kind]}
                  count={inCollections.filter((doc) => doc.kind === kind).length}
                  active={filters.kind === kind}
                  onClick={() => setFilters({ ...filters, kind: filters.kind === kind ? null : kind })}
                />
              ))}
            </div>
          )}

          {collectionsFailed && (
            <p className="mb-0 mt-3 text-[12.5px] text-[var(--accent-danger)]" role="alert">
              The collections could not be read.
            </p>
          )}
        </section>

        <div className="flex items-start gap-4">
          {base.length > 0 && (
            <FilterPanel
              title={done ? 'Refine results' : 'Browse'}
              facets={facets}
              filters={filters}
              total={ofKind.length}
              onToggleCollection={toggleCollection}
              onAllCollections={() => setFilters({ ...filters, collectionIds: new Set() })}
              onKind={(kind) => setFilters({ ...filters, kind })}
            />
          )}

          <section className={`${CARD} min-w-0 flex-1 p-4`}>
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <h2 className="m-0 flex items-center gap-2.5 text-[16px] font-semibold text-[var(--text-primary)]">
                {done ? 'Results' : 'Documents'}
                {(done || library.docs.length > 0) && <span className="text-[13px] font-normal text-[var(--text-muted)]">{shown.length}</span>}
              </h2>
              <div className="flex items-center gap-3">
                {done && shown.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/knowledge', { state: { question: state.query } })}
                    className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[12.5px] text-[var(--accent-primary)] hover:underline"
                  >
                    <Message size={13} />
                    Ask a question about this
                  </button>
                )}
                <select
                  value={sortKey}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  aria-label="Sort"
                  className="h-9 cursor-pointer rounded-[10px] border border-app-border-subtle bg-transparent px-2.5 text-[12.5px] text-[var(--text-primary)]"
                >
                  {sortOptions.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="flex overflow-hidden rounded-[10px] border border-app-border-subtle" role="group" aria-label="View">
                  {(['list', 'grid'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={view === mode}
                      onClick={() => setView(mode)}
                      className={[
                        'h-9 w-10 cursor-pointer border-0 text-[12px] font-medium',
                        view === mode ? 'bg-[var(--surface-hover)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      ].join(' ')}
                    >
                      {mode === 'list' ? 'List' : 'Grid'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {state.phase === 'loading' && <p className="m-0 text-[13px] text-[var(--text-muted)]">Searching</p>}

            {state.phase === 'failed' && (
              <p className="m-0 text-[13px] text-[var(--accent-danger)]" role="alert">
                The search could not be done. Check that the backend is running and try again.
              </p>
            )}

            {openError && (
              <p className="mb-3 mt-0 text-[12.5px] text-[var(--accent-danger)]" role="alert">
                {openError}
              </p>
            )}

            {state.phase !== 'loading' && state.phase !== 'failed' && (
              <>
                {!done && library.loading && <p className="m-0 text-[13px] text-[var(--text-muted)]">Reading your documents</p>}
                {!done && !library.loading && library.failed && (
                  <p className="m-0 text-[13px] text-[var(--accent-danger)]" role="alert">
                    The documents could not be listed.
                  </p>
                )}
                {!done && !library.loading && !library.failed && base.length === 0 && (
                  <p className="m-0 text-[13px] leading-[20px] text-[var(--text-secondary)]">No document is indexed yet. Add a source and index it from Collections, then come back.</p>
                )}
                {done && base.length === 0 && (
                  <p className="m-0 rounded-xl border border-app-border-subtle px-4 py-3.5 text-[13px] leading-[20px] text-[var(--text-secondary)]">
                    {scopeName ? `Nothing in ${scopeName} answers this.` : 'Nothing answers this.'} Try another wording, or a word the document is likely to use.
                  </p>
                )}
                {base.length > 0 && shown.length === 0 && <p className="m-0 text-[13px] text-[var(--text-secondary)]">No document is left with these filters.</p>}
                {shown.length > 0 && (
                  <ul className={['m-0 list-none gap-2.5 p-0', view === 'grid' ? 'grid grid-cols-1 xl:grid-cols-2' : 'flex flex-col'].join(' ')}>
                    {shown.map((doc) => (
                      <ResultRow key={doc.key} doc={doc} terms={terms} view={view} selected={doc.key === selected?.key} onSelect={() => setSelectedKey(doc.key === selected?.key ? null : doc.key)} />
                    ))}
                  </ul>
                )}
                {done && state.hits.length >= MAX_PASSAGES && (
                  <p className="m-0 mt-3 text-center text-[12px] text-[var(--text-muted)]">
                    The {MAX_PASSAGES} best passages ({countLabel(base.length, 'document', 'documents')}) are shown. Add words, or choose a collection, to narrow the search.
                  </p>
                )}
              </>
            )}
          </section>

          {selected && !viewerOpen && <DocumentDetails doc={selected} terms={terms} onOpen={(page) => void open(selected, page)} onClose={() => setSelectedKey(null)} />}
        </div>
      </div>
    </div>
  )
}

function KindTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'flex h-10 cursor-pointer items-center gap-2 rounded-[12px] border px-4 text-[13px] font-medium transition-colors',
        active ? 'border-transparent bg-[var(--accent-primary)] text-white' : 'border-app-border-subtle bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
      ].join(' ')}
    >
      {label}
      <span className={active ? 'text-white/80' : 'text-[var(--text-muted)]'}>{count}</span>
    </button>
  )
}
