import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Message, Search } from '@icon-park/react'
import type { Passage } from '../chat/knowledgeSearchResults'
import { groupPassages } from '../chat/passageSources'
import { useCollections, type AskScope } from '../chat/useCollections'
import { PassageDrawer } from '../components/PassageDrawer'
import { plural } from '../collections/fileStatus'
import { queryTerms } from './highlight'
import { ResultCard } from './ResultCard'
import { MAX_PASSAGES } from './searchApi'
import { SearchField } from './SearchField'
import { useSearch } from './useSearch'

export function SearchPage() {
  const navigate = useNavigate()
  const { collections, failed: collectionsFailed } = useCollections()
  const { state, run } = useSearch()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<AskScope>({ collectionId: null })
  const [opened, setOpened] = useState<Passage | null>(null)

  const searched = state.phase !== 'idle'
  const terms = useMemo(() => queryTerms(state.phase === 'idle' ? '' : state.query), [state])
  const groups = useMemo(() => (state.phase === 'done' ? groupPassages(state.passages) : []), [state])
  const scopeName = collections.find((item) => item.id === scope.collectionId)?.name ?? null

  const field = (
    <SearchField
      value={query}
      collections={collections}
      scope={scope}
      busy={state.phase === 'loading'}
      autoFocus
      onChange={setQuery}
      onScopeChange={setScope}
      onSubmit={() => void run(query, scope.collectionId)}
    />
  )

  if (!searched) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 pb-16 pt-10">
        <div className="flex w-full max-w-[var(--chat-max-width)] flex-col items-center" style={{ animation: 'slide-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
          <span className="flex size-[60px] items-center justify-center rounded-[22%] bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
            <Search size={26} />
          </span>
          <h1 className="mb-0 mt-6 text-center text-[34px] font-normal leading-[1.15] tracking-[-0.015em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
            Find a document
          </h1>
          <p className="mb-0 mt-3 text-center text-[13.5px] leading-[21px] text-[var(--text-muted)]">Look for the words your documents contain. Nothing is written for you: you get the documents and the passages themselves.</p>
          <div className="mt-8 w-full">{field}</div>
          {collectionsFailed && (
            <p className="mb-0 mt-3 text-center text-[12.5px] text-[var(--accent-danger)]" role="alert">
              The collections could not be read.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-12 pt-6">
        <div className="mx-auto flex w-full max-w-[var(--chat-max-width)] flex-col gap-5">
          {field}

          {state.phase === 'loading' && <p className="m-0 text-[13px] text-[var(--text-muted)]">Searching</p>}

          {state.phase === 'failed' && (
            <p className="m-0 text-[13px] text-[var(--accent-danger)]" role="alert">
              The search could not be done. Check that the backend is running and try again.
            </p>
          )}

          {state.phase === 'done' && (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-[12.5px] text-[var(--text-muted)]">
                  {groups.length > 0
                    ? `${plural(groups.length, 'document', 'documents')}, ${plural(state.passages.length, 'passage', 'passages')}${scopeName ? ` in ${scopeName}` : ''}`
                    : 'No result'}
                </p>
                {groups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/knowledge', { state: { question: state.query } })}
                    className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[12.5px] text-[var(--accent-primary)] hover:underline"
                  >
                    <Message size={13} />
                    Ask a question about this
                  </button>
                )}
              </div>

              {groups.length === 0 ? (
                <p className="m-0 rounded-xl border border-app-border-subtle px-4 py-3.5 text-[13px] leading-[20px] text-[var(--text-secondary)]">
                  {scopeName ? `Nothing in ${scopeName} holds these words.` : 'No document holds these words.'} Try other words, fewer words, or another form of the word. The search reads the words as they are written in the documents.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {groups.map((group) => (
                    <ResultCard key={group.key} group={group} terms={terms} onOpen={setOpened} />
                  ))}
                </div>
              )}

              {state.passages.length >= MAX_PASSAGES && (
                <p className="m-0 text-center text-[12px] text-[var(--text-muted)]">The {MAX_PASSAGES} best passages are shown. Add words, or choose a collection, to narrow the search.</p>
              )}
            </>
          )}
        </div>
      </div>

      <PassageDrawer passage={opened} terms={terms} note="This is the passage where the words were found." onClose={() => setOpened(null)} />
    </div>
  )
}
