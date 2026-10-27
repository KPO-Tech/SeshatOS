import { FolderOpen } from '@icon-park/react'
import type { Facets, Filters } from './searchModel'

type Props = {
  facets: Facets
  filters: Filters
  total: number
  onToggleCollection: (id: string) => void
  onClear: () => void
}

// What the results can be narrowed by: the collections they come from, with the number of documents in each.
export function RefinePanel({ facets, filters, total, onToggleCollection, onClear }: Props) {
  const active = filters.collectionIds.size > 0 || filters.kind !== null
  return (
    <aside aria-label="Refine the results" className="flex w-[220px] shrink-0 flex-col gap-4 self-start rounded-[16px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))] p-4">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">Refine results</h2>
        {active && (
          <button type="button" onClick={onClear} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-[var(--accent-primary)] hover:underline">
            Clear
          </button>
        )}
      </div>

      <div>
        <h3 className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--text-muted)]">Collections</h3>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {facets.collections.map((collection) => {
            const checked = filters.collectionIds.has(collection.id)
            return (
              <li key={collection.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
                  <input type="checkbox" checked={checked} onChange={() => onToggleCollection(collection.id)} className="size-3.5 shrink-0 cursor-pointer accent-[var(--accent-primary)]" />
                  <FolderOpen size={13} className="shrink-0 text-[var(--text-muted)]" />
                  <span className="min-w-0 flex-1 truncate" title={collection.name}>
                    {collection.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{collection.count}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      <p className="m-0 text-[11.5px] leading-[17px] text-[var(--text-muted)]">
        Counted over the {total} {total === 1 ? 'document' : 'documents'} of this search, not over all the collections.
      </p>
    </aside>
  )
}
