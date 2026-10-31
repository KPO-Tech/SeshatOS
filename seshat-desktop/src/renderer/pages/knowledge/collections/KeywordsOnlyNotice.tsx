import { Info } from '@icon-park/react'
import { plural } from './fileStatus'

type Props = {
  count: number
  /** Why the embedding failed, for the first of the documents. */
  reason: string
  busy: boolean
  onIndexAgain: () => void
}

/** Pinned at the top of a collection while some documents are found by their words only: the reading worked, the embedding did not. */
export function KeywordsOnlyNotice({ count, reason, busy, onIndexAgain }: Props) {
  return (
    <div
      role="status"
      title={reason}
      className="sticky top-0 z-10 flex items-start gap-2.5 rounded-xl border border-app-border-subtle bg-[var(--surface-panel)] px-3.5 py-2.5 text-[12.5px] leading-[19px] text-[var(--text-secondary)] shadow-sm"
    >
      <Info size={15} className="mt-px shrink-0 text-[var(--accent-primary)]" />
      <span className="min-w-0 flex-1">
        {plural(count, 'document is', 'documents are')} indexed for keywords only: the embedding failed, so a question finds the words of {count === 1 ? 'it' : 'them'}, not the meaning. Choose an embedding model with more quota in the settings of Knowledge, then index {count === 1 ? 'it' : 'them'} again.
      </span>
      <button
        type="button"
        onClick={onIndexAgain}
        disabled={busy}
        className="shrink-0 cursor-pointer rounded-lg border border-app-border-subtle bg-transparent px-2.5 py-1 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Starting...' : 'Index again'}
      </button>
    </div>
  )
}
