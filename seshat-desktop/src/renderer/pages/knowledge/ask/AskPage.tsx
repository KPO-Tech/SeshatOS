import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { Passage } from '../chat/knowledgeSearchResults'
import { useCollections, type AskScope } from '../chat/useCollections'
import { useKnowledgeConversation } from '../chat/useKnowledgeConversation'
import { PassageDrawer } from '../components/PassageDrawer'
import { AskComposer } from './AskComposer'
import { flattenRightPanels, useUIStore } from '@renderer/stores/ui'
import { openDocument } from '../collections/openDocument'
import { AskConversation } from './AskConversation'
import { AskHeader } from './AskHeader'
import { AskHero } from './AskHero'
import { AskHistory } from './AskHistory'
import { AskSessionSidebar } from './AskSessionSidebar'
import { AskSidebar } from './AskSidebar'
import type { OpenHow } from './askExtras'

export function AskPage() {
  const navigate = useNavigate()
  const startingQuestion = (useLocation().state as { question?: string } | null)?.question ?? ''
  const { collections, failed: collectionsFailed } = useCollections()
  const { busy, ask, stop, startError, modelLoading, configured, models, sessionId, sendMessage, open, reset } = useKnowledgeConversation()
  const started = sessionId !== null
  const [historyOpen, setHistoryOpen] = useState(false)
  const [scope, setScope] = useState<AskScope>({ collectionId: null })
  const [opened, setOpened] = useState<Passage | null>(null)
  // The beginning of a question chosen on the screen, to put in the input.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | undefined>(undefined)
  const newQuestion = useCallback(() => {
    reset()
    setOpened(null)
  }, [reset])
  // A document is open in the right panel: it takes the place of the column of cards.
  const documentOpen = useUIStore((state) => flattenRightPanels(state.rightColumns).some((panel) => Boolean(panel.documentFileId)))
  // A citation opens the document at the cited place, with the passage marked; a document of the list under the answer opens at its page,
  // with nothing marked. A passage whose file is not known (a conversation from before the tool said it) or that has no viewer is read in
  // the drawer.
  const onOpenPassage = useCallback(async (passage: Passage, how: OpenHow = 'cited') => {
    if (passage.fileId && passage.corpusId) {
      const highlight = how === 'cited' && passage.pages.length > 0 ? { text: passage.text, pages: passage.pages } : undefined
      if (await openDocument({ fileId: passage.fileId, name: passage.file }, passage.corpusId, passage.pages[0], highlight)) {
        setOpened(null)
        return
      }
    }
    setOpened(passage)
  }, [])
  const scopeName = collections.find((item) => item.id === scope.collectionId)?.name ?? null

  const problem = startError ?? (collectionsFailed ? 'Knowledge is not available: the collections could not be read.' : !configured && !modelLoading ? 'Configure a provider in Settings before asking.' : null)

  const composer = (
    <AskComposer
      collections={collections}
      scope={scope}
      busy={busy}
      models={models}
      autoFocus
      initialValue={started ? '' : startingQuestion}
      prefill={prefill}
      placeholder={started ? 'Ask a follow-up' : 'Ask about your documents'}
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

  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-hidden px-5 pb-4 pt-4">
      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-panel)_92%,var(--surface-root))]">
        <AskHeader compact={started} historyOpen={historyOpen} onToggleHistory={() => setHistoryOpen((value) => !value)} onNew={newQuestion} />
        {historyOpen && (
          <AskHistory
            currentId={sessionId}
            onOpen={(id) => open(id)}
            onNew={newQuestion}
            onDeleted={(id) => id === sessionId && newQuestion()}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {started ? (
          <AskConversation
            sessionId={sessionId ?? ''}
            isStreaming={busy}
            sendMessage={sendMessage}
            scopeName={scopeName}
            onAsk={(question) => void ask(question, scope.collectionId)}
            onOpenPassage={onOpenPassage}
          />
        ) : (
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <AskHero onPick={(text) => setPrefill({ text, nonce: Date.now() })} />
          </div>
        )}

        <div className="shrink-0 px-5 pb-4 pt-2">
          {composer}
          {notice}
        </div>

        <PassageDrawer passage={opened} onClose={() => setOpened(null)} />
      </section>

      {!documentOpen && (
        <div className="hidden min-h-0 xl:flex">
          {started && sessionId ? <AskSessionSidebar sessionId={sessionId} /> : <AskSidebar onPick={(text) => setPrefill({ text, nonce: Date.now() })} />}
        </div>
      )}
    </div>
  )
}
