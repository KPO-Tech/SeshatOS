import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Message } from '@icon-park/react'
import type { Passage } from '../chat/knowledgeSearchResults'
import { useCollections, type AskScope } from '../chat/useCollections'
import { useKnowledgeConversation } from '../chat/useKnowledgeConversation'
import { PassageDrawer } from '../components/PassageDrawer'
import { AskComposer } from './AskComposer'
import { AskHero } from './AskHero'
import { AskSidebar } from './AskSidebar'
import { HowItWorks } from './HowItWorks'
import { AskConversation } from './AskConversation'

export function AskPage() {
  const navigate = useNavigate()
  const startingQuestion = (useLocation().state as { question?: string } | null)?.question ?? ''
  const { collections, failed: collectionsFailed } = useCollections()
  const { turns, busy, ask, stop, startError, modelLoading, configured, models, sessionId, sendMessage } = useKnowledgeConversation()
  const [scope, setScope] = useState<AskScope>({ collectionId: null })
  const [opened, setOpened] = useState<Passage | null>(null)
  // The beginning of a question chosen on the screen, to put in the input.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | undefined>(undefined)
  const onOpenPassage = useCallback((passage: Passage) => setOpened(passage), [])
  const scopeName = collections.find((item) => item.id === scope.collectionId)?.name ?? null

  const problem = startError ?? (collectionsFailed ? 'Knowledge is not available: the collections could not be read.' : !configured && !modelLoading ? 'Configure a provider in Settings before asking.' : null)

  const composer = (
    <AskComposer
      collections={collections}
      scope={scope}
      busy={busy}
      models={models}
      autoFocus
      initialValue={turns.length === 0 ? startingQuestion : ''}
      prefill={prefill}
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
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-5 pb-4 pt-4">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[18px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))]">
          <header className="flex shrink-0 items-center justify-between gap-4 px-5 pb-3 pt-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
                <Message size={22} />
              </span>
              <div className="min-w-0">
                <h1 className="m-0 text-[22px] font-semibold leading-[1.2] text-[var(--text-primary)]">Ask Seshat</h1>
                <p className="m-0 truncate text-[12.5px] text-[var(--text-muted)]">Get answers from your documents, data and connected sources.</p>
              </div>
            </div>
            <HowItWorks />
          </header>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <AskHero onPick={(text) => setPrefill({ text, nonce: Date.now() })} />
          </div>

          <div className="shrink-0 px-5 pb-4 pt-2">
            {composer}
            {notice}
          </div>
        </section>

        <div className="hidden min-h-0 xl:flex">
          <AskSidebar onPick={(text) => setPrefill({ text, nonce: Date.now() })} />
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <AskConversation
        sessionId={sessionId ?? ''}
        isStreaming={busy}
        sendMessage={sendMessage}
        scopeName={scopeName}
        onAsk={(question) => void ask(question, scope.collectionId)}
        onOpenPassage={onOpenPassage}
      />
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
