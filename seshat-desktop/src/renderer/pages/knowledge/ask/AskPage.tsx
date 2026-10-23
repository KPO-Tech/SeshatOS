import { useEffect, useRef, useState } from 'react'
import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import type { Passage } from '../chat/knowledgeSearchResults'
import { useCollections, type AskScope } from '../chat/useCollections'
import { useKnowledgeConversation } from '../chat/useKnowledgeConversation'
import { PassageDrawer } from '../components/PassageDrawer'
import { AskComposer } from './AskComposer'
import { TurnView } from './TurnView'

export function AskPage() {
  const navigate = useNavigate()
  const { collections, failed: collectionsFailed } = useCollections()
  const { turns, busy, ask, stop, startError, modelLoading, configured } = useKnowledgeConversation()
  const [scope, setScope] = useState<AskScope>({ collectionId: null })
  const [opened, setOpened] = useState<Passage | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const last = turns.at(-1)
  const writtenLength = last?.text.length ?? 0

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 160) element.scrollTo({ top: element.scrollHeight })
  }, [turns.length, writtenLength, last?.phase])

  const onOpenPassage = useCallback((passage: Passage) => setOpened(passage), [])
  const scopeName = collections.find((item) => item.id === scope.collectionId)?.name ?? null

  const problem = startError ?? (collectionsFailed ? 'Knowledge is not available: the collections could not be read.' : !configured && !modelLoading ? 'Configure a provider in Settings before asking.' : null)

  const composer = (
    <AskComposer
      collections={collections}
      scope={scope}
      busy={busy}
      autoFocus
      placeholder={turns.length ? 'Ask a follow-up' : 'Ask about your documents'}
      onScopeChange={setScope}
      onSubmit={(question) => void ask(question, scope.collectionId)}
      onStop={() => void stop()}
    />
  )

  const notice = problem && (
    <p className="mb-0 mt-3 text-center text-[12.5px] leading-[19px] text-[var(--accent-danger)]" role="alert">
      {problem}
      {!configured && !modelLoading && (
        <>
          {' '}
          <button type="button" onClick={() => navigate('/')} className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-[var(--accent-primary)] underline">
            Open the chat
          </button>
        </>
      )}
    </p>
  )

  if (turns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-16 pt-10">
        <div className="flex w-full max-w-[var(--chat-max-width)] flex-col items-center" style={{ animation: 'slide-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
          <img src="brand/knowledge-icon.svg" alt="" width={60} height={60} className="rounded-[22%] shadow-[0_14px_34px_-14px_var(--accent-primary)]" />
          <h1 className="mb-0 mt-6 text-center text-[34px] font-normal leading-[1.15] tracking-[-0.015em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
            What do you want to know?
          </h1>
          <p className="mb-0 mt-3 max-w-[460px] text-center text-[13.5px] leading-[21px] text-[var(--text-muted)]">
            Answers come only from the documents you can read, and each one shows the passages it rests on.
          </p>
          <div className="mt-8 w-full">{composer}</div>
          {notice}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pt-8">
        <div className="mx-auto flex max-w-[var(--chat-max-width)] flex-col gap-12 pb-10">
          {turns.map((turn) => (
            <TurnView key={turn.id} turn={turn} scopeName={scopeName} onOpenPassage={onOpenPassage} />
          ))}
        </div>
      </div>
      <div className="shrink-0 px-6 pb-5">
        <div className="mx-auto max-w-[var(--chat-max-width)]">
          {composer}
          {notice}
        </div>
      </div>

      <PassageDrawer passage={opened} onClose={() => setOpened(null)} />
    </div>
  )
}
