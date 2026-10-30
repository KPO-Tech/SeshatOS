import { Info } from '@icon-park/react'

/** Shown while no embedding model is set: documents are still indexed, by keywords only. */
export function IndexingNotice() {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-xl border border-app-border-subtle bg-[var(--surface-hover)] px-3.5 py-2.5 text-[12.5px] leading-[19px] text-[var(--text-secondary)]">
      <Info size={15} className="mt-px shrink-0 text-[var(--text-muted)]" />
      <span>No embedding model is set, so documents are searched by keywords only: a question finds the words it shares with a document, not its meaning. Set an embedding model in the settings of Knowledge to search by meaning.</span>
    </div>
  )
}
