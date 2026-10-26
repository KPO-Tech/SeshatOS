import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Left, Plus } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { FolderPlanModal } from '../sources/FolderPlanModal'
import { CollectionCard } from './CollectionCard'
import { CollectionDialog } from './CollectionDialog'
import { createCollection, indexCollection } from './collectionsApi'
import { plural } from './fileStatus'
import { IndexingNotice } from './IndexingNotice'
import { SourceIconPicker } from './SourceIcon'
import { DEFAULT_SOURCE_ID, removeSource, updateSource } from './sourcesApi'
import { useCollectionList } from './useCollectionList'

const BUTTON = 'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-colors'
const PRIMARY = `${BUTTON} border-0 bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)]`
const QUIET = `${BUTTON} border border-app-border-subtle bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-muted)]`

// The collections of one source: the default one (made in the app) or a folder added as a source.
export function SourcePage() {
  const { sourceId = DEFAULT_SOURCE_ID } = useParams()
  const navigate = useNavigate()
  const { collections, sources, loading, failed, indexingConfigured, reload } = useCollectionList()
  const [creating, setCreating] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)

  const isDefault = sourceId === DEFAULT_SOURCE_ID
  const source = isDefault ? null : (sources.find((s) => s.id === sourceId) ?? null)
  const own = collections.filter((c) => c.sourceId === (isDefault ? '' : sourceId))
  const back = () => navigate('/knowledge/collections')
  const open = (id: string) => navigate(`/knowledge/collections/${encodeURIComponent(id)}`)

  async function create(name: string, description: string) {
    const created = await createCollection(name, description)
    setCreating(false)
    await reload()
    open(created.id)
  }

  async function indexAll() {
    setIndexing(true)
    setError(null)
    setNotice(null)
    try {
      let queued = 0
      for (const collection of own) queued += await indexCollection(collection.id)
      setNotice(queued === 0 ? 'Nothing is waiting to be indexed.' : `${plural(queued, 'document', 'documents')} queued for indexing. Open a collection to follow it.`)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The indexing could not be started.')
    } finally {
      setIndexing(false)
    }
  }

  async function changeIcon(icon: string) {
    if (!source) return
    setError(null)
    try {
      await updateSource(source.id, { icon })
      await reload()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The icon could not be changed.')
    }
  }

  async function remove() {
    if (!source) return
    setError(null)
    try {
      await removeSource(source.id)
      back()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The source could not be removed.')
    }
  }

  if (!loading && !failed && !isDefault && !source) {
    return (
      <div className="px-8 pt-10">
        <p className="m-0 text-[13px] text-[var(--text-muted)]">This source does not exist any more.</p>
        <button type="button" onClick={back} className="mt-3 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-[var(--accent-primary)] underline">
          Back to the collections
        </button>
      </div>
    )
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-10">
      <div className="mx-auto w-full max-w-[880px]" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
        <button type="button" onClick={back} className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <Left size={14} />
          Collections
        </button>

        <div className="mt-4 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {isDefault ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
                <SeshatLogo size={22} />
              </span>
            ) : (
              <SourceIconPicker value={source?.icon ?? ''} onChange={(icon) => void changeIcon(icon)} disabled={!source} />
            )}
            <div className="min-w-0">
              <h1 className="m-0 truncate text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
                {isDefault ? 'Seshat' : (source?.name ?? '')}
              </h1>
              {source && (
                <p className="m-0 mt-1 truncate text-[12px] text-[var(--text-muted)]" title={source.root}>
                  {source.root}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isDefault ? (
              <button type="button" onClick={() => setCreating(true)} className={PRIMARY}>
                <Plus size={14} />
                New collection
              </button>
            ) : (
              <>
                {own.length === 0 && (
                  <button type="button" onClick={() => void remove()} className={QUIET} title="Remove this source; no file is touched">
                    Remove
                  </button>
                )}
                {own.length > 0 && (
                  <button type="button" onClick={() => void indexAll()} disabled={indexing} className={PRIMARY}>
                    {indexing ? 'Starting...' : 'Index everything'}
                  </button>
                )}
                <button type="button" onClick={() => setAnalysing(true)} className={own.length === 0 ? PRIMARY : QUIET}>
                  {own.length === 0 ? 'Analyse to import collections' : 'Analyse again'}
                </button>
              </>
            )}
          </div>
        </div>

        {indexingConfigured === false && own.length > 0 && (
          <div className="mt-6">
            <IndexingNotice />
          </div>
        )}

        {notice && <p className="mb-0 mt-6 text-[13px] text-[var(--text-secondary)]">{notice}</p>}

        {(failed || error) && (
          <p className="mb-0 mt-8 text-[13px] text-[var(--accent-danger)]" role="alert">
            {error ?? 'The collections could not be read.'}
          </p>
        )}

        {!loading && !failed && own.length === 0 && (
          <p className="mb-0 mt-10 text-[13px] leading-[20px] text-[var(--text-muted)]">
            {isDefault ? 'No collection yet. New collection makes one, and its documents are added from the collection.' : 'Nothing has been read from this folder yet. Analyse it to propose collections.'}
          </p>
        )}

        {own.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {own.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} onOpen={() => open(collection.id)} />
            ))}
          </div>
        )}
      </div>

      {creating && <CollectionDialog title="New collection" submitLabel="Create" onSubmit={create} onClose={() => setCreating(false)} />}
      {analysing && source && <FolderPlanModal source={source} onClose={() => setAnalysing(false)} onCreated={() => void reload()} />}
    </div>
  )
}
