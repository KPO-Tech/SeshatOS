import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Message, Search } from '@icon-park/react'
import { useUIStore } from '@renderer/stores/ui'
import type { FileKind } from '../chat/passageSources'
import { useCollections, type AskScope } from '../chat/useCollections'
import { openDocument } from '../collections/openDocument'
import { ScopeSelect } from '../components/ScopeSelect'
import { DocumentDetails } from './DocumentDetails'
import { queryTerms } from './highlight'
import { RefinePanel } from './RefinePanel'
import { ResultRow } from './ResultRow'
import { MAX_PASSAGES } from './searchApi'
import { SearchBar } from './SearchBar'
import { countLabel, facetsOf, filterDocs, groupDocs, KIND_LABEL, NO_FILTERS, sortDocs, type Doc, type Filters, type SortKey } from './searchModel'
import { useSearch } from './useSearch'

export function SearchPage() {
  const navigate = useNavigate()
  const { collections, failed: collectionsFailed } = useCollections()
  const { state, run } = useSearch()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<AskScope>({ collectionId: null })
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [sort, setSort] = useState<SortKey>('relevance')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  // The viewer takes the right of the screen when a document is open: the details give it the room.
  const viewerOpen = useUIStore((s) => s.rightColumns.length > 0)

  const searched = state.phase !== 'idle'
  const terms = useMemo(() => queryTerms(state.phase === 'idle' ? '' : state.query), [state])
  const docs = useMemo(() => (state.phase === 'done' ? groupDocs(state.hits) : []), [state])
  const facets = useMemo(() => facetsOf(docs), [docs])
  const inCollections = useMemo(() => filterDocs(docs, { ...filters, kind: null }), [docs, filters])
  const shown = useMemo(() => sortDocs(filterDocs(docs, filters), sort), [docs, filters, sort])
  const selected = shown.find((doc) => doc.key === selectedKey) ?? null
  const scopeName = collections.find((item) => item.id === scope.collectionId)?.name ?? null

  // A new search starts from every document again.
  useEffect(() => {
    setFilters(NO_FILTERS)
    setSelectedKey(null)
    setOpenError(null)
  }, [state.phase === 'done' ? state.query : null])

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

  const bar = <SearchBar value={query} busy={state.phase === 'loading'} autoFocus onChange={setQuery} onSubmit={submit} />
  const scopePill = <ScopeSelect collections={collections} scope={scope} onChange={setScope} placement="down" />

  if (!searched) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-16 pt-10">
        <div className="flex w-full max-w-[720px] flex-col items-center" style={{ animation: 'slide-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
          <span className="flex size-[60px] items-center justify-center rounded-[22%] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
            <Search size={26} />
          </span>
          <h1 className="mb-0 mt-6 text-center text-[34px] font-normal leading-[1.15] tracking-[-0.015em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
            Search knowledge
          </h1>
          <p className="mb-0 mt-3 text-center text-[13.5px] leading-[21px] text-[var(--text-muted)]">Find the documents and the passages that answer you, across your collections. Nothing is written for you: you get the passages as they are.</p>
          <div className="mt-8 w-full">{bar}</div>
          <div className="mt-3 flex w-full items-center justify-between gap-3">
            <span className="text-[12px] text-[var(--text-muted)]">Where to look</span>
            {scopePill}
          </div>
          {collectionsFailed && (
            <p className="mb-0 mt-3 text-center text-[12.5px] text-[var(--accent-danger)]" role="alert">
              The collections could not be read.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-6 pt-5">
        <div className="mx-auto flex w-full max-w-[1280px] items-center gap-3">
          <div className="min-w-0 flex-1">{bar}</div>
          {scopePill}
        </div>

        {state.phase === 'done' && docs.length > 0 && (
          <div role="tablist" aria-label="Kind of document" className="mx-auto mt-4 flex w-full max-w-[1280px] flex-wrap gap-2">
            <KindTab label="All" count={inCollections.length} active={filters.kind === null} onClick={() => setFilters({ ...filters, kind: null })} />
            {facets.kinds.map(({ kind }) => (
              <KindTab
                key={kind}
                label={KIND_LABEL[kind]}
                count={inCollections.filter((doc) => doc.kind === kind).length}
                active={filters.kind === kind}
                onClick={() => setFilters({ ...filters, kind: filters.kind === kind ? null : (kind as FileKind) })}
              />
            ))}
          </div>
        )}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-12 pt-5">
        <div className="mx-auto flex w-full max-w-[1280px] items-start gap-5">
          {state.phase === 'done' && docs.length > 0 && (
            <RefinePanel facets={facets} filters={filters} total={docs.length} onToggleCollection={toggleCollection} onClear={() => setFilters(NO_FILTERS)} />
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            {state.phase === 'loading' && <p className="m-0 text-[13px] text-[var(--text-muted)]">Searching</p>}

            {state.phase === 'failed' && (
              <p className="m-0 text-[13px] text-[var(--accent-danger)]" role="alert">
                The search could not be done. Check that the backend is running and try again.
              </p>
            )}

            {state.phase === 'done' && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="m-0 text-[13px] text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{docs.length > 0 ? countLabel(shown.length, 'document', 'documents') : 'No result'}</span>
                    {docs.length > 0 && <span className="text-[var(--text-muted)]">{`  •  ${countLabel(state.hits.length, 'passage', 'passages')}${scopeName ? ` in ${scopeName}` : ''}`}</span>}
                  </p>
                  {docs.length > 0 && (
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
                        Sort
                        <select
                          value={sort}
                          onChange={(event) => setSort(event.target.value as SortKey)}
                          className="h-8 cursor-pointer rounded-[9px] border border-app-border-subtle bg-transparent px-2 text-[12.5px] text-[var(--text-primary)]"
                        >
                          <option value="relevance">Most relevant</option>
                          <option value="name">Name</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => navigate('/knowledge', { state: { question: state.query } })}
                        className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[12.5px] text-[var(--accent-primary)] hover:underline"
                      >
                        <Message size={13} />
                        Ask a question about this
                      </button>
                    </div>
                  )}
                </div>

                {openError && (
                  <p className="m-0 text-[12.5px] text-[var(--accent-danger)]" role="alert">
                    {openError}
                  </p>
                )}

                {docs.length === 0 ? (
                  <p className="m-0 rounded-xl border border-app-border-subtle px-4 py-3.5 text-[13px] leading-[20px] text-[var(--text-secondary)]">
                    {scopeName ? `Nothing in ${scopeName} answers this.` : 'Nothing answers this.'} Try another wording, or a word the document is likely to use.
                  </p>
                ) : shown.length === 0 ? (
                  <p className="m-0 rounded-xl border border-app-border-subtle px-4 py-3.5 text-[13px] text-[var(--text-secondary)]">No document is left with these filters.</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                    {shown.map((doc) => (
                      <ResultRow key={doc.key} doc={doc} terms={terms} selected={doc.key === selected?.key} onSelect={() => setSelectedKey(doc.key === selected?.key ? null : doc.key)} />
                    ))}
                  </ul>
                )}

                {state.hits.length >= MAX_PASSAGES && (
                  <p className="m-0 text-center text-[12px] text-[var(--text-muted)]">The {MAX_PASSAGES} best passages are shown. Add words, or choose a collection, to narrow the search.</p>
                )}
              </>
            )}
          </div>

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
        'flex h-9 cursor-pointer items-center gap-2 rounded-[11px] border px-3.5 text-[13px] font-medium transition-colors',
        active ? 'border-transparent bg-[var(--accent-primary)] text-white' : 'border-app-border-subtle bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
      ].join(' ')}
    >
      {label}
      <span className={active ? 'text-white/80' : 'text-[var(--text-muted)]'}>{count}</span>
    </button>
  )
}
