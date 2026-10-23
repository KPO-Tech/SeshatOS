import { useEffect, useMemo, useRef, useState } from 'react'
import { Message } from '@icon-park/react'
import { DocumentDrawer } from '../components/DocumentDrawer'
import { SAMPLE_QUESTIONS } from '../data/sampleApi'
import type { AskScope, SourceRef } from '../data/types'
import { useCollections, useDocuments, useKnowledgeApi } from '../data/useKnowledgeData'
import { AskComposer } from './AskComposer'
import { TurnView } from './TurnView'
import { useAsk } from './useAsk'

const SUGGESTIONS = SAMPLE_QUESTIONS

export function AskPage() {
  const api = useKnowledgeApi()
  const collections = useCollections(api)
  const { turns, busy, ask, stop } = useAsk(api)
  const [scope, setScope] = useState<AskScope>({ collectionId: null })
  const [activeN, setActiveN] = useState<number | null>(null)
  const [opened, setOpened] = useState<SourceRef | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const ids = useMemo(() => [...new Set(turns.flatMap((turn) => turn.sources.map((source) => source.documentId)))], [turns])
  const documents = useDocuments(api, ids)
  const latest = turns.at(-1)
  const writtenLength = latest?.text.length ?? 0

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 160) element.scrollTo({ top: element.scrollHeight })
  }, [turns.length, writtenLength, latest?.phase])

  const composer = (
    <AskComposer
      collections={collections}
      scope={scope}
      busy={busy}
      autoFocus
      placeholder={turns.length ? 'Ask a follow-up' : 'Ask about your documents'}
      onScopeChange={setScope}
      onSubmit={(question) => void ask(question, scope)}
      onStop={stop}
    />
  )

  if (turns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-16 pt-10">
        <div className="flex w-full max-w-[720px] flex-col items-center" style={{ animation: 'slide-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
          <img src="brand/knowledge-icon.svg" alt="" width={60} height={60} className="rounded-[22%] shadow-[0_14px_34px_-14px_var(--accent-primary)]" />
          <h1 className="mb-0 mt-6 text-center text-[34px] font-normal leading-[1.15] tracking-[-0.015em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
            What do you want to know?
          </h1>
          <p className="mb-0 mt-3 max-w-[460px] text-center text-[13.5px] leading-[21px] text-[var(--text-muted)]">
            Answers come only from the documents you can read, and each one shows the passages it rests on.
          </p>
          <div className="mt-8 w-full">{composer}</div>
          <div className="mt-6 grid w-full gap-2 sm:grid-cols-3">
            {SUGGESTIONS.map((question, index) => (
              <button
                key={question}
                type="button"
                onClick={() => void ask(question, scope)}
                className="flex min-h-[78px] cursor-pointer flex-col items-start justify-between gap-3 rounded-xl border border-solid border-[var(--border-soft)] bg-transparent p-3.5 text-left transition-[background-color,border-color,transform] duration-150 hover:-translate-y-px hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                style={{ animation: `slide-up 420ms cubic-bezier(0.22, 1, 0.36, 1) ${160 + index * 70}ms both` }}
              >
                <Message size={15} className="text-[var(--accent-primary)]" />
                <span className="text-[12.5px] leading-[18px] text-[var(--text-secondary)]">{question}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scroller} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pt-8">
          <div className="mx-auto flex max-w-[720px] flex-col gap-12 pb-10">
            {turns.map((turn, index) => (
              <TurnView
                key={turn.id}
                turn={turn}
                documents={documents}
                collections={collections}
                activeN={activeN}
                isLatest={index === turns.length - 1}
                onHoverSource={setActiveN}
                onOpenSource={setOpened}
              />
            ))}
          </div>
        </div>
        <div className="shrink-0 px-6 pb-5">
          <div className="mx-auto max-w-[720px]">{composer}</div>
        </div>
      </div>

      <DocumentDrawer
        document={opened ? (documents[opened.documentId] ?? null) : null}
        collections={collections}
        page={opened?.page ?? 0}
        excerpt={opened?.excerpt ?? ''}
        onClose={() => setOpened(null)}
      />
    </div>
  )
}
