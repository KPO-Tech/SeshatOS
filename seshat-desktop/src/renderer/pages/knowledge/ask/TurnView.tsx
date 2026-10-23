import { Caution, Check, Info } from '@icon-park/react'
import { splitAnswer } from './citations'
import type { Turn } from './useAsk'
import type { KnowledgeCollection, KnowledgeDocument, SourceRef } from '../data/types'
import { CitationChip } from '../components/CitationChip'
import { SourcesDisclosure } from '@renderer/components/sources/SourcesDisclosure'
import { documentSourceItems } from '../components/documentSourceItems'

type Props = {
  turn: Turn
  documents: Record<string, KnowledgeDocument>
  collections: KnowledgeCollection[]
  activeN: number | null
  isLatest: boolean
  onHoverSource: (n: number | null) => void
  onOpenSource: (source: SourceRef) => void
}

export function TurnView({ turn, documents, collections, activeN, isLatest, onHoverSource, onOpenSource }: Props) {
  const parts = splitAnswer(turn.text)
  const sourceOf = (n: number) => turn.sources.find((item) => item.n === n)
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
          {parts.map((part, index) => {
            if (part.type === 'text') return <span key={index}>{part.value}</span>
            const source = sourceOf(part.n)
            if (!source) return null
            const document = documents[source.documentId]
            return (
              <CitationChip
                key={index}
                source={source}
                document={document}
                collectionName={collections.find((item) => item.id === document?.collectionId)?.name}
                active={isLatest && activeN === part.n}
                onHover={(hovering) => onHoverSource(hovering ? part.n : null)}
                onOpen={() => onOpenSource(source)}
              />
            )
          })}
          {writing && <span className="ml-0.5 inline-block h-[18px] w-[2px] translate-y-[3px] bg-[var(--accent-primary)]" style={{ animation: 'pulse-opacity 0.9s ease-in-out infinite' }} />}
        </p>
      )}

      {turn.limits && (
        <div className="mt-5" style={{ animation: 'fade-in 400ms ease both' }}>
          {turn.sources.length > 0 ? (
            <SourcesDisclosure
              items={documentSourceItems(turn.sources, documents, collections, isLatest ? activeN : null, onOpenSource)}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Info size={13} />
                  {`Based on ${turn.limits.documentsUsed} ${turn.limits.documentsUsed === 1 ? 'document' : 'documents'} among those you can read, in ${turn.limits.collectionsSearched} ${turn.limits.collectionsSearched === 1 ? 'collection' : 'collections'}`}
                </span>
              }
            />
          ) : (
            <p className="m-0 flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
              <Info size={13} />
              {`Searched ${turn.limits.collectionsSearched} ${turn.limits.collectionsSearched === 1 ? 'collection' : 'collections'} you can read.`}
            </p>
          )}
          {turn.limits.notFound && (
            <p className="mb-0 mt-2 rounded-lg border border-solid border-[color-mix(in_srgb,var(--accent-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-warning)_10%,transparent)] px-3 py-2 text-[12.5px] leading-[18px] text-[var(--text-secondary)]">
              {turn.limits.notFound}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
