import { FORMATS, SORTS, STATES, type DocumentFormat, type DocumentView, type SortKey, type StateFilter } from './documentOrder'
import { plural } from './fileStatus'

type Props = {
  view: DocumentView
  onChange: (view: DocumentView) => void
  shown: number
  total: number
  failed: number
  retrying: boolean
  onRetryFailed: () => void
}

const SELECT =
  'cursor-pointer rounded-lg border border-app-border-subtle bg-transparent px-2.5 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]'

/** Sort and filter of the documents of a collection, and the one button that starts every failed document again. */
export function DocumentToolbar({ view, onChange, shown, total, failed, retrying, onRetryFailed }: Props) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
        Sort
        <select className={SELECT} value={view.sort} onChange={(event) => onChange({ ...view, sort: event.target.value as SortKey })} aria-label="Sort the documents">
          {SORTS.map((sort) => (
            <option key={sort.id} value={sort.id}>
              {sort.label}
            </option>
          ))}
        </select>
      </label>
      <select className={SELECT} value={view.format} onChange={(event) => onChange({ ...view, format: event.target.value as DocumentFormat | 'all' })} aria-label="Filter by format">
        <option value="all">Any format</option>
        {FORMATS.map((format) => (
          <option key={format.id} value={format.id}>
            {format.label}
          </option>
        ))}
      </select>
      <select className={SELECT} value={view.state} onChange={(event) => onChange({ ...view, state: event.target.value as StateFilter })} aria-label="Filter by state">
        {STATES.map((state) => (
          <option key={state.id} value={state.id}>
            {state.label}
          </option>
        ))}
      </select>
      {shown !== total && <span className="text-[12px] text-[var(--text-muted)]">{`${shown} of ${plural(total, 'document', 'documents')}`}</span>}
      {failed > 0 && (
        <button
          type="button"
          onClick={onRetryFailed}
          disabled={retrying}
          className="ml-auto cursor-pointer rounded-lg border border-app-border-subtle bg-transparent px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? 'Starting...' : `Retry ${plural(failed, 'failed document', 'failed documents')}`}
        </button>
      )}
    </div>
  )
}
