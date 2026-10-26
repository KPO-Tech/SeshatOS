import { FolderOpen } from '@icon-park/react'
import type { Collection } from './collectionsApi'
import { plural } from './fileStatus'

const formatDay = (seconds: number) => (seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export function CollectionCard({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
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
