import type { ReactNode } from 'react'
import { FileText, FolderOpen } from '@icon-park/react'
import type { FileKind } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import { KIND_LABEL, type Facets, type Filters } from './searchModel'

type Props = {
  title: string
  facets: Facets
  filters: Filters
  total: number
  // How many documents there are of every kind: the figure of "All types".
  kindsTotal: number
  onToggleCollection: (id: string) => void
  onAllCollections: () => void
  onKind: (kind: FileKind | null) => void
}

const CARD = 'rounded-[16px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] p-2.5'

function Row({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={[
          'flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border-0 px-2 py-1.5 text-left text-[12.5px] transition-colors',
          active ? 'bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]' : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
        ].join(' ')}
      >
        <span className="flex w-[18px] shrink-0 items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1 truncate" title={label}>
          {label}
        </span>
        <span className={active ? 'shrink-0 text-[12px]' : 'shrink-0 text-[12px] text-[var(--text-muted)]'}>{count}</span>
      </button>
    </li>
  )
}

// The two lists on the left of the results: the collections, and the kinds of document, each with the number of documents it holds.
export function FilterPanel({ title, facets, filters, total, kindsTotal, onToggleCollection, onAllCollections, onKind }: Props) {
  return (
    <aside aria-label={title} className="flex min-h-0 w-[220px] shrink-0 flex-col gap-3">
      <section className={`${CARD} flex min-h-0 flex-col`}>
        <h2 className="m-0 mb-1.5 shrink-0 px-1.5 text-[13px] font-semibold text-[var(--text-primary)]">Collections</h2>
        <ul className="no-scrollbar m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-0">
          <Row active={filters.collectionIds.size === 0} onClick={onAllCollections} icon={<FolderOpen size={14} />} label="All collections" count={total} />
          {facets.collections.map((collection) => (
            <Row key={collection.id} active={filters.collectionIds.has(collection.id)} onClick={() => onToggleCollection(collection.id)} icon={<FolderOpen size={14} />} label={collection.name} count={collection.count} />
          ))}
        </ul>
      </section>

      <section className={`${CARD} flex min-h-0 flex-col`}>
        <h2 className="m-0 mb-1.5 shrink-0 px-1.5 text-[13px] font-semibold text-[var(--text-primary)]">Document type</h2>
        <ul className="no-scrollbar m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-0">
          <Row active={filters.kind === null} onClick={() => onKind(null)} icon={<FileText size={14} />} label="All types" count={kindsTotal} />
          {facets.kinds.map(({ kind, count }) => (
            <Row key={kind} active={filters.kind === kind} onClick={() => onKind(filters.kind === kind ? null : kind)} icon={<FileKindIcon kind={kind} size={16} />} label={KIND_LABEL[kind]} count={count} />
          ))}
        </ul>
      </section>
    </aside>
  )
}
