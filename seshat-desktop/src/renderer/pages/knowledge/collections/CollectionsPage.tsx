import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, Plus, Search } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { useDeviceMode } from '../useCanManage'
import { CollectionCard, KnowledgeCard } from './CollectionCard'
import { AddSourceDialog } from './AddSourceDialog'
import { plural } from './fileStatus'
import { SourceIcon } from './SourceIcon'
import { DEFAULT_SOURCE_ID, sourcePath } from './sourcesApi'
import { useCollectionList } from './useCollectionList'

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3'

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-4">
      <h2 className="m-0 mb-3 flex items-center gap-2 text-[16px] font-semibold text-[var(--text-primary)]">
        {title}
        <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--text-muted)]">{count}</span>
      </h2>
      {children}
    </section>
  )
}

// The root of Collections: the places collections come from, as cards. The collections themselves are inside each source, one click away.
export function CollectionsPage() {
  const navigate = useNavigate()
  const { collections, sources, loading, failed, reload } = useCollectionList()
  const deviceMode = useDeviceMode()
  const [addingSource, setAddingSource] = useState(false)
  // Folder sources are kept on this computer: a device connected to an organization takes its collections from the organization's server.
  const canAddSource = deviceMode === 'standalone'
  const [query, setQuery] = useState('')

  // The collections made in the app have no source id: it is the default source, as on the page of a source.
  const countIn = (sourceId: string) => collections.filter((c) => c.sourceId === (sourceId === DEFAULT_SOURCE_ID ? '' : sourceId)).length

  const needle = query.trim().toLowerCase()
  const showDefault = !needle || 'seshat'.includes(needle)
  const shownSources = sources.filter((s) => !needle || `${s.name} ${s.root}`.toLowerCase().includes(needle))
  const sourceCount = (showDefault ? 1 : 0) + shownSources.length
  // A search also lists the collections that match, since a source is not the only way to find one.
  const matching = useMemo(
    () => (needle ? collections.filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(needle)).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [collections, needle]
  )

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-5">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
            <FolderOpen theme="filled" size={24} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">Collections</h1>
            <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)]">Choose a source to see its collections.</p>
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
            <Section title="Sources" count={sourceCount}>
              {sourceCount === 0 ? (
                <p className="m-0 py-2 text-[13px] text-[var(--text-muted)]">No source matches.</p>
              ) : (
                <div className={GRID}>
                  {showDefault && (
                    <KnowledgeCard
                      icon={<SeshatLogo size={22} />}
                      title="Seshat"
                      subtitle={plural(countIn(DEFAULT_SOURCE_ID), 'collection', 'collections')}
                      description="The collections made and filled in the app."
                      onOpen={() => navigate(sourcePath(DEFAULT_SOURCE_ID))}
                    />
                  )}
                  {shownSources.map((source) => (
                    <KnowledgeCard
                      key={source.id}
                      icon={<SourceIcon icon={source.icon} size={20} />}
                      title={source.name}
                      subtitle={plural(countIn(source.id), 'collection', 'collections')}
                      description={source.root}
                      onOpen={() => navigate(sourcePath(source.id))}
                    />
                  ))}
                </div>
              )}
            </Section>

            {needle !== '' && (
              <Section title="Collections" count={matching.length}>
                {matching.length === 0 ? (
                  <p className="m-0 py-2 text-[13px] text-[var(--text-muted)]">No collection matches.</p>
                ) : (
                  <div className={GRID}>
                    {matching.map((collection) => (
                      <CollectionCard key={collection.id} collection={collection} onOpen={() => navigate(`/knowledge/collections/${encodeURIComponent(collection.id)}`)} />
                    ))}
                  </div>
                )}
              </Section>
            )}
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
