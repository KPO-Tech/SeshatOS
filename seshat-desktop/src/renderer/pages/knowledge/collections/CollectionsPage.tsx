import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, Plus } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { FolderPlanModal } from '../sources/FolderPlanModal'
import { useDeviceMode } from '../useCanManage'
import { AddSourceDialog } from './AddSourceDialog'
import { CollectionDialog } from './CollectionDialog'
import { createCollection, type Collection } from './collectionsApi'
import { plural } from './fileStatus'
import { IndexingNotice } from './IndexingNotice'
import { removeSource, type KnowledgeSource } from './sourcesApi'
import { useCollectionList } from './useCollectionList'

const formatDay = (seconds: number) => (seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

const BUTTON = 'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-colors'
const PRIMARY = `${BUTTON} border-0 bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)]`
const QUIET = `${BUTTON} border border-app-border-subtle bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-muted)]`

function CollectionCard({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const documents = collection.fileCount === null ? null : plural(collection.fileCount, 'document', 'documents')
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex cursor-pointer flex-col items-start gap-3 rounded-2xl border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] p-4 text-left transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--accent-primary)_40%,var(--border-soft))] hover:shadow-[0_10px_26px_rgba(31,27,23,0.08)]"
    >
      <span className="flex size-9 items-center justify-center rounded-[10px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
        <FolderOpen size={18} />
      </span>
      <span className="min-w-0 max-w-full">
        <span className="block truncate text-[14.5px] font-medium text-[var(--text-primary)]">{collection.name}</span>
        <span className="mt-1 line-clamp-2 min-h-[38px] text-[12.5px] leading-[19px] text-[var(--text-muted)]">{collection.description || 'No description'}</span>
      </span>
      <span className="text-[12px] text-[var(--text-muted)]">
        {[documents, collection.updatedAt ? `Updated ${formatDay(collection.updatedAt)}` : null].filter(Boolean).join('   ')}
      </span>
    </button>
  )
}

function SourceHeader({ icon, title, detail, children }: { icon: React.ReactNode; title: string; detail: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">{icon}</span>
        <div className="min-w-0">
          <h2 className="m-0 truncate text-[15px] font-medium text-[var(--text-primary)]">{title}</h2>
          <p className="m-0 mt-0.5 truncate text-[12px] text-[var(--text-muted)]" title={detail}>
            {detail}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function CollectionsPage() {
  const navigate = useNavigate()
  const { collections, sources, loading, failed, indexingConfigured, reload } = useCollectionList()
  const deviceMode = useDeviceMode()
  const [creating, setCreating] = useState(false)
  const [addingSource, setAddingSource] = useState(false)
  const [analysing, setAnalysing] = useState<KnowledgeSource | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  // Sources are kept on this computer: a device connected to an organization takes its collections from the organization's server.
  const canUseSources = deviceMode === 'standalone'

  const open = (id: string) => navigate(`/knowledge/collections/${encodeURIComponent(id)}`)
  const ownCollections = collections.filter((c) => c.sourceId === '')
  const collectionsOf = (source: KnowledgeSource) => collections.filter((c) => c.sourceId === source.id)

  async function create(name: string, description: string) {
    const created = await createCollection(name, description)
    setCreating(false)
    await reload()
    open(created.id)
  }

  async function remove(source: KnowledgeSource) {
    setSourceError(null)
    try {
      await removeSource(source.id)
      await reload()
    } catch (err) {
      setSourceError(err instanceof Error && err.message ? err.message : 'The source could not be removed.')
    }
  }

  const empty = !loading && !failed && collections.length === 0 && sources.length === 0

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-10">
      <div className="mx-auto w-full max-w-[880px]" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-[30px] font-normal leading-[1.15] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
              Collections
            </h1>
            <p className="mb-0 mt-2 text-[13.5px] leading-[21px] text-[var(--text-muted)]">The documents Knowledge answers from. Each collection keeps its own documents, grouped by where they come from.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canUseSources && (
              <button type="button" onClick={() => setAddingSource(true)} className={QUIET}>
                <Plus size={14} />
                Add source
              </button>
            )}
            <button type="button" onClick={() => setCreating(true)} className={PRIMARY}>
              <Plus size={14} />
              New collection
            </button>
          </div>
        </div>

        {indexingConfigured === false && collections.length > 0 && (
          <div className="mt-6">
            <IndexingNotice />
          </div>
        )}

        {failed && (
          <p className="mb-0 mt-8 text-[13px] text-[var(--accent-danger)]" role="alert">
            The collections could not be read.
          </p>
        )}
        {sourceError && (
          <p className="mb-0 mt-6 text-[13px] text-[var(--accent-danger)]" role="alert">
            {sourceError}
          </p>
        )}

        {empty && (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
              <FolderOpen size={22} />
            </span>
            <h2 className="mb-0 mt-5 text-[20px] font-normal text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
              No collection yet
            </h2>
            <p className="mb-0 mt-2 max-w-[380px] text-[13px] leading-[20px] text-[var(--text-muted)]">Create one, add documents to it, and Ask answers from them{canUseSources ? ', or add a folder of this computer as a source' : ''}.</p>
            <button type="button" onClick={() => setCreating(true)} className={`${PRIMARY} mt-5`}>
              Create a collection
            </button>
          </div>
        )}

        {!empty && !failed && !loading && (
          <div className="mt-8 space-y-10">
            <section aria-label="Seshat">
              <SourceHeader icon={<SeshatLogo size={18} />} title="Seshat" detail="Made and filled in the app" />
              {ownCollections.length > 0 ? (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ownCollections.map((collection) => (
                    <CollectionCard key={collection.id} collection={collection} onOpen={() => open(collection.id)} />
                  ))}
                </div>
              ) : (
                <p className="mb-0 mt-3 text-[12.5px] text-[var(--text-muted)]">No collection here yet. New collection makes one.</p>
              )}
            </section>

            {sources.map((source) => {
              const own = collectionsOf(source)
              return (
                <section key={source.id} aria-label={source.name}>
                  <SourceHeader icon={<FolderOpen size={18} />} title={source.name} detail={source.root}>
                    <button type="button" onClick={() => setAnalysing(source)} className={QUIET}>
                      {own.length === 0 ? 'Analyse to import collections' : 'Analyse again'}
                    </button>
                    {own.length === 0 && (
                      <button type="button" onClick={() => void remove(source)} className={QUIET} title="Remove this source; no file is touched">
                        Remove
                      </button>
                    )}
                  </SourceHeader>
                  {own.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {own.map((collection) => (
                        <CollectionCard key={collection.id} collection={collection} onOpen={() => open(collection.id)} />
                      ))}
                    </div>
                  ) : (
                    <p className="mb-0 mt-3 text-[12.5px] text-[var(--text-muted)]">Nothing has been read yet. Analyse the folder to propose collections from it.</p>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>

      {creating && <CollectionDialog title="New collection" submitLabel="Create" onSubmit={create} onClose={() => setCreating(false)} />}
      {addingSource && (
        <AddSourceDialog
          onClose={() => setAddingSource(false)}
          onAdded={async () => {
            setAddingSource(false)
            await reload()
          }}
        />
      )}
      {analysing && <FolderPlanModal source={analysing} onClose={() => setAnalysing(null)} onCreated={() => void reload()} />}
    </div>
  )
}
