import type { ReactNode } from 'react'
import { FolderOpen } from '@icon-park/react'
import type { FileKind } from '../chat/passageSources'
import { FileKindIcon } from '../components/FileKindIcon'
import { KIND_LABEL, type Facets, type Filters } from './searchModel'

type Props = {
  title: string
  facets: Facets
  filters: Filters
  total: number
  onToggleCollection: (id: string) => void
  onAllCollections: () => void
  onKind: (kind: FileKind | null) => void
}

const CARD = 'rounded-[16px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] p-3.5'

function Row({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={[
          'flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 px-2.5 py-2 text-left text-[13px] transition-colors',
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
export function FilterPanel({ title, facets, filters, total, onToggleCollection, onAllCollections, onKind }: Props) {
  return (
    <aside aria-label={title} className="sticky top-0 flex w-[240px] shrink-0 flex-col gap-3 self-start">
      <section className={CARD}>
        <h2 className="m-0 mb-2 px-1 text-[13.5px] font-semibold text-[var(--text-primary)]">Collections</h2>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          <Row active={filters.collectionIds.size === 0} onClick={onAllCollections} icon={<FolderOpen size={14} />} label="All collections" count={total} />
          {facets.collections.map((collection) => (
            <Row key={collection.id} active={filters.collectionIds.has(collection.id)} onClick={() => onToggleCollection(collection.id)} icon={<FolderOpen size={14} />} label={collection.name} count={collection.count} />
          ))}
        </ul>
      </section>

      <section className={CARD}>
        <h2 className="m-0 mb-2 px-1 text-[13.5px] font-semibold text-[var(--text-primary)]">Document type</h2>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {facets.kinds.map(({ kind, count }) => (
            <Row key={kind} active={filters.kind === kind} onClick={() => onKind(filters.kind === kind ? null : kind)} icon={<FileKindIcon kind={kind} size={16} />} label={KIND_LABEL[kind]} count={count} />
          ))}
        </ul>
      </section>
    </aside>
  )
}
