import { Caution, Check, Info } from '@icon-park/react'
import { splitAnswer } from './citations'
import type { Turn } from './useAsk'
import type { KnowledgeCollection, KnowledgeDocument, SourceRef } from '../data/types'
import { SourcesList } from '../components/SourcesList'

type Props = {
  turn: Turn
  documents: Record<string, KnowledgeDocument>
  collections: KnowledgeCollection[]
  activeN: number | null
  isLatest: boolean
  onHoverSource: (n: number | null) => void
  onOpenSource: (source: SourceRef) => void
}

function CitePill({ n, active, onHover, onOpen }: { n: number; active: boolean; onHover: (n: number | null) => void; onOpen: () => void }) {
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(n)}
      onMouseLeave={() => onHover(null)}
      onClick={onOpen}
      aria-label={`Source ${n}`}
      className={`mx-[3px] inline-flex h-[18px] min-w-[18px] cursor-pointer items-center justify-center rounded-full border-0 px-1 align-[2px] text-[10.5px] font-bold transition-colors ${
        active ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--accent-subtle)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white'
      }`}
    >
      {n}
    </button>
  )
}

export function TurnView({ turn, documents, collections, activeN, isLatest, onHoverSource, onOpenSource }: Props) {
  const parts = splitAnswer(turn.text)
  const writing = turn.phase === 'writing'
  const passageCount = turn.sources.length
  const documentCount = new Set(turn.sources.map((source) => source.documentId)).size

  return (
    <section className="py-2" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
      <h2 className="m-0 text-[26px] font-normal leading-[1.25] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
        {turn.question}
      </h2>

      <div className="mt-4 flex h-6 items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
        {turn.phase === 'searching' ? (
          <>
            <span className="size-1.5 rounded-full bg-[var(--accent-primary)]" style={{ animation: 'pulse-opacity 1.1s ease-in-out infinite' }} />
            <span>{turn.collectionsSearched > 1 ? `Searching ${turn.collectionsSearched} collections` : 'Searching'}</span>
          </>
        ) : turn.phase === 'error' ? (
          <>
            <Caution size={13} className="text-[var(--accent-danger)]" />
            <span className="text-[var(--accent-danger)]">{turn.error}</span>
          </>
        ) : passageCount > 0 ? (
          <>
            <Check size={13} className="text-[var(--accent-success)]" />
            <span>
              {passageCount} {passageCount === 1 ? 'passage' : 'passages'} in {documentCount} {documentCount === 1 ? 'document' : 'documents'}
            </span>
          </>
        ) : turn.phase === 'done' ? (
          <span>No passage found</span>
        ) : null}
      </div>

      {(turn.text || writing) && (
        <p className="mb-0 mt-3 text-[15.5px] leading-[28px] text-[var(--text-primary)]">
          {parts.map((part, index) =>
            part.type === 'text' ? (
              <span key={index}>{part.value}</span>
            ) : (
              <CitePill key={index} n={part.n} active={isLatest && activeN === part.n} onHover={onHoverSource} onOpen={() => {
                const source = turn.sources.find((item) => item.n === part.n)
                if (source) onOpenSource(source)
              }} />
            )
          )}
          {writing && <span className="ml-0.5 inline-block h-[18px] w-[2px] translate-y-[3px] bg-[var(--accent-primary)]" style={{ animation: 'pulse-opacity 0.9s ease-in-out infinite' }} />}
        </p>
      )}

      {turn.limits && (
        <div className="mt-5" style={{ animation: 'fade-in 400ms ease both' }}>
          <p className="m-0 flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
            <Info size={13} />
            {turn.limits.documentsUsed > 0
              ? `Based on ${turn.limits.documentsUsed} ${turn.limits.documentsUsed === 1 ? 'document' : 'documents'} among those you can read, in ${turn.limits.collectionsSearched} ${turn.limits.collectionsSearched === 1 ? 'collection' : 'collections'}.`
              : `Searched ${turn.limits.collectionsSearched} ${turn.limits.collectionsSearched === 1 ? 'collection' : 'collections'} you can read.`}
          </p>
          {turn.limits.notFound && (
            <p className="mb-0 mt-2 rounded-lg border border-solid border-[color-mix(in_srgb,var(--accent-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-warning)_10%,transparent)] px-3 py-2 text-[12.5px] leading-[18px] text-[var(--text-secondary)]">
              {turn.limits.notFound}
            </p>
          )}
        </div>
      )}

      {turn.sources.length > 0 && (
        <div className="mt-6 min-[1500px]:hidden">
          <h3 className="mb-2.5 mt-0 text-[12px] font-semibold text-[var(--text-secondary)]">Sources</h3>
          <SourcesList sources={turn.sources} documents={documents} collections={collections} activeN={isLatest ? activeN : null} onOpen={onOpenSource} onHover={onHoverSource} />
        </div>
      )}
    </section>
  )
}
