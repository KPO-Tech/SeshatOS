import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Message, Search, Sort } from '@icon-park/react'
import { flattenRightPanels, useUIStore } from '@renderer/stores/ui'
import { useCollections, type AskScope } from '../chat/useCollections'
import { openDocument, passageTarget } from '../collections/openDocument'
import { ChoiceSelect } from '../components/ChoiceSelect'
import { ScopeSelect } from '../components/ScopeSelect'
import { FilterPanel } from './FilterPanel'
import { queryTerms } from './highlight'
import { fetchDocuments } from './libraryApi'
import { ResultRow, type View } from './ResultRow'
import { MAX_PASSAGES } from './searchApi'
import { SearchBar } from './SearchBar'
import { facetsOf, filterDocs, groupDocs, KIND_ORDER, NO_FILTERS, sortDocs, withListing, type Doc, type Facets, type Filters, type Hit, type SortKey } from './searchModel'
import { useLibrary } from './useLibrary'
import { useLibraryTotals } from './useLibraryTotals'
import { useSearch } from './useSearch'

const CARD = 'rounded-[18px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))]'

export function SearchPage() {
  const navigate = useNavigate()
  const { collections, failed: collectionsFailed } = useCollections()
  const { state, run, reset } = useSearch()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<AskScope>({ collectionId: null })
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey | null>(null)
  const [view, setView] = useState<View>('list')
  const [openError, setOpenError] = useState<string | null>(null)
  // What is known of the documents a search found (when they were added, how many passages they hold).
  const [listing, setListing] = useState<Doc[]>([])
  // The document open in the viewer on the right, to mark its row.
  const openFileId = useUIStore((s) => flattenRightPanels(s.rightColumns).find((panel) => panel.documentFileId)?.documentFileId ?? null)

  const done = state.phase === 'done'
  const searching = state.phase !== 'idle'
  const terms = useMemo(() => queryTerms(state.phase === 'idle' ? '' : state.query), [state])

  // Before a search the documents are read a page at a time, narrowed and sorted by the database: whatever the number of documents,
  // only the pages that are scrolled to are read. After a search the few passages found are narrowed here.
  const browseSort = sort === 'name' ? 'name' : 'recent'
  const totals = useLibraryTotals()
  const library = useLibrary({ corpusIds: [...filters.collectionIds], kind: filters.kind, sort: browseSort, enabled: !searching })

  const found = useMemo<Doc[]>(() => (state.phase === 'done' ? withListing(groupDocs(state.hits), listing) : []), [state, listing])
  const inCollections = useMemo(() => filterDocs(found, { ...filters, kind: null }), [found, filters])
  const ofKind = useMemo(() => filterDocs(found, { ...filters, collectionIds: new Set() }), [found, filters])
  const sortKey: SortKey = sort ?? (done ? 'relevance' : 'recent')
  const shown = useMemo(() => (done ? sortDocs(filterDocs(found, filters), sortKey) : library.docs), [done, found, filters, sortKey, library.docs])

  const facets: Facets = useMemo(() => {
    if (done) return { collections: facetsOf(ofKind).collections, kinds: facetsOf(inCollections).kinds }
    return {
      collections: library.collections,
      kinds: KIND_ORDER.filter((kind) => (library.kinds[kind] ?? 0) > 0).map((kind) => ({ kind, count: library.kinds[kind] ?? 0 }))
    }
  }, [done, ofKind, inCollections, library.collections, library.kinds])
  const collectionsTotal = facets.collections.reduce((sum, item) => sum + item.count, 0)
  const resultCount = done ? shown.length : library.total

  const scopeName = collections.find((item) => item.id === scope.collectionId)?.name ?? null

  // Clearing the bar goes back to the list of documents, and closes the document that was open beside the results: it belonged to the search.
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const lastQuery = useRef(query)
  useEffect(() => {
    if (query === '' && state.phase !== 'idle') reset()
    if (query === '' && lastQuery.current !== '') {
      for (const panel of flattenRightPanels(useUIStore.getState().rightColumns)) if (panel.documentFileId) closeRightPanel(panel.id)
    }
    lastQuery.current = query
  }, [query, state.phase, reset, closeRightPanel])

  // A new search starts from every document again, and the documents it found are asked for what the listing knows of them.
  useEffect(() => {
    setFilters(NO_FILTERS)
    setOpenError(null)
    setSort(null)
    setListing([])
    if (state.phase !== 'done') return
    let cancelled = false
    const fileIds = [...new Set(state.hits.map((hit) => hit.fileId))]
    if (fileIds.length > 0) {
      fetchDocuments({ fileIds, limit: 100 })
        .then((page) => !cancelled && setListing(page.docs))
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [state.phase === 'done' ? state.query : null])

  // The collection chosen at the top narrows the list of documents; it is where a search looks.
  useEffect(() => {
    setFilters({ collectionIds: new Set(scope.collectionId ? [scope.collectionId] : []), kind: null })
  }, [scope.collectionId])

  // The end of the list is scrolled to: the next page.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = sentinel.current
    if (!node || done) return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && library.loadMore(), { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [done, library.loadMore, library.docs.length])

  const submit = () => void run(query, scope.collectionId)

  const toggleCollection = (id: string) =>
    setFilters((current) => {
      const next = new Set(current.collectionIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...current, collectionIds: next }
    })

  // A result opens its document at the passage found, with the passage marked; a document only listed (no search) opens on its first page.
  async function open(doc: Doc, hit?: Hit) {
    setOpenError(null)
    try {
      const target = hit ? passageTarget(hit.text, hit.pages) : undefined
      if (!(await openDocument({ fileId: doc.fileId, name: doc.path }, doc.corpusId, target?.page, target?.highlight))) setOpenError(`There is no preview for this kind of file yet: ${doc.name}`)
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

  const scopePill = <ScopeSelect collections={collections} scope={scope} onChange={setScope} placement="down" />

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 pb-4 pt-4">
      <section className={`${CARD} shrink-0 p-3.5`}>
        {!searching && (
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
                <Search size={18} />
              </span>
              <div className="min-w-0">
                <h1 className="m-0 text-[17px] font-semibold leading-[1.2] text-[var(--text-primary)]">Search knowledge</h1>
                <p className="m-0 truncate text-[12.5px] text-[var(--text-muted)]">Find the documents and the passages that answer you, across all your collections.</p>
              </div>
            </div>
            {scopePill}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <SearchBar value={query} busy={state.phase === 'loading'} autoFocus onChange={setQuery} onSubmit={submit} />
          </div>
          {searching && scopePill}
        </div>

        {collectionsFailed && (
          <p className="mb-0 mt-2 text-[12.5px] text-[var(--accent-danger)]" role="alert">
            The collections could not be read.
          </p>
        )}
      </section>

      <div className="flex min-h-0 flex-1 gap-3">
        {openFileId === null && (done ? found.length > 0 : library.total > 0 || facets.collections.length > 0) && (
          <FilterPanel
            title={done ? 'Refine results' : 'Browse'}
            facets={{ collections: facets.collections, kinds: totals.kinds.length > 0 ? totals.kinds : facets.kinds }}
            filters={filters}
            total={collectionsTotal}
            kindsTotal={totals.total}
            onToggleCollection={toggleCollection}
            onAllCollections={() => setFilters({ ...filters, collectionIds: new Set() })}
            onKind={(kind) => setFilters({ ...filters, kind })}
          />
        )}

        <section className={`${CARD} @container flex min-h-0 min-w-0 flex-1 flex-col p-3`}>
          <div className="mb-2.5 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="m-0 flex items-center gap-2 text-[14.5px] font-semibold text-[var(--text-primary)]">
              {done ? 'Results' : 'Documents'}
              {(done || library.total > 0) && <span className="text-[12.5px] font-normal text-[var(--text-muted)]">{resultCount}</span>}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {done && shown.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/knowledge', { state: { question: state.query } })}
                  title="Ask a question about this search"
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-0 bg-transparent p-0 text-[12px] text-[var(--accent-primary)] hover:underline"
                >
                  <Message size={12} />
                  <span>
                    Ask<span className="hidden @2xl:inline"> a question about this</span>
                  </span>
                </button>
              )}
              <ChoiceSelect label="Sort" icon={<Sort size={12} />} choices={sortOptions} value={sortKey} onChange={setSort} />
              <div className="flex overflow-hidden rounded-[9px] border border-app-border-subtle" role="group" aria-label="View">
                {(['list', 'grid'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={view === mode}
                    onClick={() => setView(mode)}
                    className={['h-8 w-11 cursor-pointer border-0 text-[12px] font-medium', view === mode ? 'bg-[var(--surface-hover)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'].join(' ')}
                  >
                    {mode === 'list' ? 'List' : 'Grid'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            {state.phase === 'loading' && <p className="m-0 text-[13px] text-[var(--text-muted)]">Searching</p>}

            {state.phase === 'failed' && (
              <p className="m-0 text-[13px] text-[var(--accent-danger)]" role="alert">
                The search could not be done. Check that the backend is running and try again.
              </p>
            )}

            {openError && (
              <p className="mb-2 mt-0 text-[12.5px] text-[var(--accent-danger)]" role="alert">
                {openError}
              </p>
            )}

            {state.phase !== 'loading' && state.phase !== 'failed' && (
              <>
                {!done && library.loading && library.docs.length === 0 && <p className="m-0 text-[13px] text-[var(--text-muted)]">Reading your documents</p>}
                {!done && !library.loading && library.failed && library.docs.length === 0 && (
                  <p className="m-0 text-[13px] text-[var(--accent-danger)]" role="alert">
                    The documents could not be listed.
                  </p>
                )}
                {!done && !library.loading && !library.failed && library.total === 0 && (
                  <p className="m-0 text-[13px] leading-[20px] text-[var(--text-secondary)]">
                    {filters.collectionIds.size > 0 || filters.kind ? 'No document is left with these filters.' : 'No document is indexed yet. Add a source and index it from Collections, then come back.'}
                  </p>
                )}
                {done && found.length === 0 && (
                  <p className="m-0 rounded-xl border border-app-border-subtle px-4 py-3.5 text-[13px] leading-[20px] text-[var(--text-secondary)]">
                    {scopeName ? `Nothing in ${scopeName} answers this.` : 'Nothing answers this.'} Try another wording, or a word the document is likely to use.
                  </p>
                )}
                {done && found.length > 0 && shown.length === 0 && <p className="m-0 text-[13px] text-[var(--text-secondary)]">No document is left with these filters.</p>}
                {shown.length > 0 && (
                  <ul className={['m-0 list-none gap-2.5 p-0', view === 'grid' ? 'grid grid-cols-1 @2xl:grid-cols-2 @6xl:grid-cols-3' : 'flex flex-col'].join(' ')}>
                    {shown.map((doc) => (
                      <ResultRow key={doc.key} doc={doc} terms={terms} view={view} opened={doc.fileId === openFileId} onOpen={(hit) => void open(doc, hit)} />
                    ))}
                  </ul>
                )}
                {!done && <div ref={sentinel} className="h-px" aria-hidden="true" />}
                {!done && library.hasMore && <p className="m-0 py-3 text-center text-[12px] text-[var(--text-muted)]">Loading more documents</p>}
                {done && state.hits.length >= MAX_PASSAGES && <p className="m-0 mt-3 text-center text-[12px] text-[var(--text-muted)]">The {MAX_PASSAGES} best passages are shown. Add words, or choose a collection, to narrow the search.</p>}
              </>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
