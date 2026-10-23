import { useCallback, useMemo, type ReactNode } from 'react'
import { Caution, Check, Info } from '@icon-park/react'
import { MarkdownView } from '@renderer/components/ui/MarkdownView'
import { SourcesDisclosure } from '@renderer/components/sources/SourcesDisclosure'
import { prepareAnswer, refOfHref } from '../chat/answerText'
import type { AskTurn } from '../chat/askTurns'
import type { Passage } from '../chat/knowledgeSearchResults'
import { groupPassages } from '../chat/passageSources'
import { CitationChip } from '../components/CitationChip'
import { passageSourceItems } from '../components/passageSourceItems'

type Props = {
  turn: AskTurn
  // The name of the collection the question was limited to, if it was.
  scopeName: string | null
  onOpenPassage: (passage: Passage) => void
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function Status({ turn }: { turn: AskTurn }): ReactNode {
  if (turn.phase === 'error') {
    return (
      <>
        <Caution size={13} className="text-[var(--accent-danger)]" />
        <span className="text-[var(--accent-danger)]">The question could not be answered</span>
      </>
    )
  }
  if (turn.phase === 'searching') {
    return (
      <>
        <span className="size-1.5 rounded-full bg-[var(--accent-primary)]" style={{ animation: 'pulse-opacity 1.1s ease-in-out infinite' }} />
        <span>{turn.searching || turn.searches === 0 ? 'Searching' : 'Reading what was found'}</span>
      </>
    )
  }
  if (turn.passages.length > 0) {
    const documents = groupPassages(turn.passages).length
    return (
      <>
        <Check size={13} className="text-[var(--accent-success)]" />
        <span>
          {plural(turn.passages.length, 'passage', 'passages')} in {plural(documents, 'document', 'documents')}
        </span>
      </>
    )
  }
  return turn.phase === 'done' ? <span>No passage found</span> : null
}

export function TurnView({ turn, scopeName, onOpenPassage }: Props) {
  const known = useMemo(() => new Set(turn.passages.map((passage) => passage.ref)), [turn.passages])
  const text = useMemo(() => prepareAnswer(turn.text, known), [turn.text, known])

  // The markdown view rebuilds its components when this function changes: it changes only with the excerpts.
  const renderCitation = useCallback(
    (href: string | undefined) => {
      const ref = refOfHref(href)
      const passage = ref ? turn.passages.find((item) => item.ref === ref) : undefined
      return passage ? <CitationChip passage={passage} onOpen={() => onOpenPassage(passage)} /> : null
    },
    [turn.passages, onOpenPassage]
  )

  const finished = turn.phase === 'done'
  // The documents the answer cites; when it cites none, the ones the searches found, so that its basis is still shown.
  const basis = turn.cited.length > 0 ? turn.cited : turn.passages
  const documents = groupPassages(basis).length

  return (
    <section className="py-2" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
      <h2 className="m-0 text-[26px] font-normal leading-[1.25] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
        {turn.question}
      </h2>

      <div className="mt-4 flex h-6 items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
        <Status turn={turn} />
      </div>

      {turn.text.trim() !== '' && (
        <div className="mt-3">
          <MarkdownView streaming={turn.phase === 'writing'} renderLink={renderCitation}>
            {text}
          </MarkdownView>
        </div>
      )}

      {finished && (
        <div className="mt-5" style={{ animation: 'fade-in 400ms ease both' }}>
          {basis.length > 0 ? (
            <SourcesDisclosure
              items={passageSourceItems(basis, null, onOpenPassage)}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Info size={13} />
                  {`Based on ${plural(documents, 'document', 'documents')}${turn.collectionsSearched ? ` among ${plural(turn.collectionsSearched, 'collection', 'collections')} you can read` : ''}`}
                </span>
              }
            />
          ) : (
            <p className="m-0 rounded-lg border border-solid border-[color-mix(in_srgb,var(--accent-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-warning)_10%,transparent)] px-3 py-2 text-[12.5px] leading-[18px] text-[var(--text-secondary)]">
              {scopeName ? `No passage in ${scopeName} matched. Try another collection or other words.` : 'No passage matched. Try other words, or look for the document by keyword.'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
