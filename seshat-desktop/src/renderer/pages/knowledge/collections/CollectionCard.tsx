import type { ReactNode } from 'react'
import { FolderOpen, Play } from '@icon-park/react'
import type { Collection } from './collectionsApi'
import { plural } from './fileStatus'

const formatDay = (seconds: number) => (seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

/** The frame of a card of Collections: the same as a card of Skills, so the two pages read alike. */
export function KnowledgeCard({ icon, title, subtitle, description, footer, onOpen }: { icon: ReactNode; title: string; subtitle: string; description: string; footer?: ReactNode; onOpen: () => void }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-primary)]">{icon}</span>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{title}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-[var(--text-muted)]">{subtitle}</div>
        </div>
      </div>
      <p className="m-0 mt-3 line-clamp-2 min-h-[38px] break-words text-[12.5px] leading-[19px] text-[var(--text-secondary)]">{description}</p>
      {footer && <div className="mt-3 flex min-h-[26px] flex-wrap gap-1.5 overflow-hidden">{footer}</div>}
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-soft)] bg-transparent text-[13px] font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-hover)]"
      >
        <Play theme="outline" size={13} />
        Open
      </button>
    </div>
  )
}


export function CollectionCard({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const documents = collection.fileCount === null ? null : plural(collection.fileCount, 'document', 'documents')
  return (
    <KnowledgeCard
      icon={<FolderOpen theme="outline" size={20} />}
      title={collection.name}
      subtitle={[documents, collection.updatedAt ? `Updated ${formatDay(collection.updatedAt)}` : null].filter(Boolean).join(' · ') || 'Collection'}
      description={collection.description || 'No description'}
      onOpen={onOpen}
    />
  )
}
