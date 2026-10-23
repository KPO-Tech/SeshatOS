import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, Plus } from '@icon-park/react'
import { CollectionDialog } from './CollectionDialog'
import { createCollection, type Collection } from './collectionsApi'
import { plural } from './fileStatus'
import { IndexingNotice } from './IndexingNotice'
import { useCollectionList } from './useCollectionList'

const formatDay = (seconds: number) => (seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

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

export function CollectionsPage() {
  const navigate = useNavigate()
  const { collections, loading, failed, indexingConfigured, reload } = useCollectionList()
  const [creating, setCreating] = useState(false)

  const open = (id: string) => navigate(`/knowledge/collections/${encodeURIComponent(id)}`)

  async function create(name: string, description: string) {
    const created = await createCollection(name, description)
    setCreating(false)
    await reload()
    open(created.id)
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-10">
      <div className="mx-auto w-full max-w-[880px]" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 text-[30px] font-normal leading-[1.15] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
              Collections
            </h1>
            <p className="mb-0 mt-2 text-[13.5px] leading-[21px] text-[var(--text-muted)]">The documents Knowledge answers from. Each collection keeps its own documents.</p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] border-0 bg-[var(--accent-primary)] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            <Plus size={14} />
            New collection
          </button>
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

        {!loading && !failed && collections.length === 0 && (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
              <FolderOpen size={22} />
            </span>
            <h2 className="mb-0 mt-5 text-[20px] font-normal text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
              No collection yet
            </h2>
            <p className="mb-0 mt-2 max-w-[380px] text-[13px] leading-[20px] text-[var(--text-muted)]">Create one, add documents to it, and Ask answers from them.</p>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-5 cursor-pointer rounded-[10px] border-0 bg-[var(--accent-primary)] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Create a collection
            </button>
          </div>
        )}

        {collections.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} onOpen={() => open(collection.id)} />
            ))}
          </div>
        )}
      </div>

      {creating && <CollectionDialog title="New collection" submitLabel="Create" onSubmit={create} onClose={() => setCreating(false)} />}
    </div>
  )
}
