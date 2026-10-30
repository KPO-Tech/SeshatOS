import { useEffect } from 'react'
import { CloseSmall } from '@icon-park/react'
import type { Passage } from '../chat/knowledgeSearchResults'
import { kindOfFile, pagesLabel } from '../chat/passageSources'
import { Highlighted } from '../search/Highlighted'
import { FileKindIcon } from './FileKindIcon'

type Props = {
  passage: Passage | null
  // The words of a search to mark in the passage, when the passage comes from one.
  terms?: readonly string[]
  // What the footer says about the passage.
  note?: string
  onClose: () => void
}

// A cited passage opened beside the answer, with where it comes from. The document itself is not read here yet: only the passage the
// agent was given.
export function PassageDrawer({ passage, terms = [], note = 'This is the passage the answer rests on, as the agent read it.', onClose }: Props) {
  useEffect(() => {
    if (!passage) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [passage, onClose])

  if (!passage) return null
  const title = passage.file || passage.collection
  const meta = [pagesLabel(passage.pages), passage.collection, passage.section].filter(Boolean)

  return (
    <div className="absolute inset-0 z-40 flex justify-end" role="dialog" aria-label={title} style={{ animation: 'fade-in 160ms ease both' }}>
      <button type="button" aria-label="Close passage" onClick={onClose} className="absolute inset-0 cursor-default border-0 bg-black/35" />
      <aside
        className="relative flex h-full w-[min(560px,100%)] flex-col border-0 border-l border-solid border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.6)]"
        style={{ animation: 'knowledge-drawer-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <header className="flex items-start gap-3 border-0 border-b border-solid border-[var(--border-soft)] px-5 py-4">
          <FileKindIcon kind={kindOfFile(passage.file)} size={34} />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
            {meta.length > 0 && <p className="mb-0 mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{meta.join(' · ')}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            <CloseSmall size={18} />
          </button>
        </header>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <div className="rounded-lg border border-solid border-[var(--border-soft)] bg-[var(--surface-root)] px-9 py-9">
            <p className="m-0 whitespace-pre-wrap text-[14.5px] leading-[26px] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
              <Highlighted text={passage.text} terms={terms} />
            </p>
          </div>
          <p className="mb-0 mt-3 text-center text-[11.5px] text-[var(--text-muted)]">{note}</p>
        </div>
      </aside>
    </div>
  )
}
