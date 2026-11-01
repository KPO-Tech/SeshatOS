import { FolderOpen, Right } from '@icon-park/react'
import type { Collection } from './collectionsApi'
import { plural } from './fileStatus'

const formatDay = (seconds: number) => (seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

/** A collection as a compact card: its name, how many documents it holds and where it comes from. */
export function CollectionCard({ collection, source, onOpen }: { collection: Collection; source?: string; onOpen: () => void }) {
  const documents = collection.fileCount === null ? null : plural(collection.fileCount, 'document', 'documents')
  const meta = [documents, source, collection.updatedAt ? formatDay(collection.updatedAt) : null].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      title={collection.description || undefined}
      className="group flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
        <FolderOpen size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{collection.name}</span>
        <span className="mt-0.5 block truncate text-[11.5px] leading-[16px] text-[var(--text-muted)]">{meta}</span>
      </span>
      <span className="shrink-0 text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
        <Right size={14} />
      </span>
    </button>
  )
}
