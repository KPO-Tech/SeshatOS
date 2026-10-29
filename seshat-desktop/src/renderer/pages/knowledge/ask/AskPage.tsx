import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { Passage } from '../chat/knowledgeSearchResults'
import { resolvePassageFile } from '../chat/passageFile'
import { useCollections, type AskScope } from '../chat/useCollections'
import { useKnowledgeConversation } from '../chat/useKnowledgeConversation'
import { PassageDrawer } from '../components/PassageDrawer'
import { AskComposer } from './AskComposer'
import { AskNotices } from './AskNotices'
import { AskState } from './AskState'
import { askNotices, askStop, type AskAction } from './askReadiness'
import { useEmbedderState } from './useEmbedderState'
import { useDeviceMode, useCanManageKnowledge } from '../useCanManage'
import { useDialogsStore } from '@renderer/stores/dialogs'
import { flattenRightPanels, useUIStore } from '@renderer/stores/ui'
import { openDocument, passageTarget } from '../collections/openDocument'
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
  const { collections, loading: collectionsLoading, failed: collectionsFailed, reload: reloadCollections } = useCollections()
  const mode = useDeviceMode()
  const { allowed: canManage } = useCanManageKnowledge()
  const embedder = useEmbedderState()
  const openConfig = useDialogsStore((state) => state.openConfig)
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
  // with nothing marked. A passage whose search did not name its file (a conversation from before it did) is looked for by the names of its
  // collection and its file; one that cannot be found, or that has no viewer, is read in the drawer.
  const onOpenPassage = useCallback(
    async (passage: Passage, how: OpenHow = 'cited') => {
      const origin = passage.fileId && passage.corpusId ? { fileId: passage.fileId, corpusId: passage.corpusId } : await resolvePassageFile(passage, collections)
      if (origin) {
        const target = passageTarget(passage.text, passage.pages)
        if (await openDocument({ fileId: origin.fileId, name: passage.file }, origin.corpusId, target.page, how === 'cited' ? target.highlight : undefined)) {
          setOpened(null)
          return
        }
      }
      setOpened(passage)
    },
    [collections]
  )
  // What stops a question being asked (shown in place of the start of the screen), and what only warns.
  const readiness = { loading: collectionsLoading, collectionsFailed, collectionCount: collections.length, mode, canManage, embedder }
  const blocker = started ? null : askStop(readiness)
  const notices = askNotices(readiness)
  const onStateAction = useCallback(
    (action: AskAction) => {
      if (action === 'retry') reloadCollections()
      else if (action === 'add-source') navigate('/knowledge/sources')
      else openConfig('search')
    },
    [navigate, openConfig, reloadCollections]
  )
  const scopeName = collections.find((item) => item.id === scope.collectionId)?.name ?? null

  const problem = startError ?? (!configured && !modelLoading ? 'Configure a provider in Settings before asking.' : null)

  const composer = (
    <AskComposer
      collections={collections}
      scope={scope}
      busy={busy}
      blocked={blocker ? blocker.title : undefined}
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
            {blocker ? <AskState stop={blocker} onAction={onStateAction} /> : <AskHero onPick={(text) => setPrefill({ text, nonce: Date.now() })} />}
          </div>
        )}

        <div className="shrink-0 px-5 pb-4 pt-2">
          {!blocker && <AskNotices notices={notices} onAction={onStateAction} />}
          {composer}
          {notice}
        </div>

        <PassageDrawer passage={opened} onClose={() => setOpened(null)} />
      </section>

      {!documentOpen && (
        <div className="hidden min-h-0 xl:flex">
          {started && sessionId ? <AskSessionSidebar sessionId={sessionId} /> : <AskSidebar onPick={(text) => !blocker && setPrefill({ text, nonce: Date.now() })} />}
        </div>
      )}
    </div>
  )
}
