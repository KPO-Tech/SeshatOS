import { useEffect, useState } from 'react'
import { CloseSmall, Left, Right } from '@icon-park/react'
import type { KnowledgeCollection, KnowledgeDocument } from '../api/types'
import { FileKindIcon } from './FileKindIcon'
import { splitHighlight } from './highlight'

const DATE = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric' })

type Props = {
  document: KnowledgeDocument | null
  collections: KnowledgeCollection[]
  page: number
  excerpt: string
  onClose: () => void
}

// A document opened at the page an answer cited, with the cited passage marked. The viewer shows the pages the server returned around it.
export function DocumentDrawer({ document, collections, page, excerpt, onClose }: Props) {
  const [current, setCurrent] = useState(page)

  useEffect(() => setCurrent(page), [page, document?.id])
  useEffect(() => {
    if (!document) return
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [document, onClose])

  if (!document) return null
  const numbers = document.pages.map((item) => item.number)
  const index = Math.max(0, numbers.indexOf(current))
  const shown = document.pages[index]
  const collection = collections.find((item) => item.id === document.collectionId)

  return (
    <div className="absolute inset-0 z-40 flex justify-end" role="dialog" aria-label={document.name} style={{ animation: 'fade-in 160ms ease both' }}>
      <button type="button" aria-label="Close document" onClick={onClose} className="absolute inset-0 cursor-default border-0 bg-black/35" />
      <aside
        className="relative flex h-full w-[min(560px,100%)] flex-col border-0 border-l border-solid border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.6)]"
        style={{ animation: 'knowledge-drawer-in 260ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <header className="flex items-start gap-3 border-0 border-b border-solid border-[var(--border-soft)] px-5 py-4">
          <FileKindIcon kind={document.kind} size={34} />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 truncate text-[15px] font-semibold text-[var(--text-primary)]">{document.name}</h2>
            <p className="mb-0 mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
              {[collection?.name, document.source, `Updated ${DATE.format(new Date(document.updatedAt))}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            <CloseSmall size={18} />
          </button>
        </header>

        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-[12px] font-semibold text-[var(--text-secondary)]">
            Page {shown?.number} of {document.pageCount}
          </span>
          <span className="flex gap-1">
            <button type="button" aria-label="Previous page" disabled={index === 0} onClick={() => setCurrent(numbers[index - 1])} className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-solid border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] enabled:hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-35">
              <Left size={14} />
            </button>
            <button type="button" aria-label="Next page" disabled={index >= numbers.length - 1} onClick={() => setCurrent(numbers[index + 1])} className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-solid border-[var(--border-soft)] bg-transparent text-[var(--text-secondary)] enabled:hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-35">
              <Right size={14} />
            </button>
          </span>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          <div className="mx-auto min-h-[420px] rounded-lg border border-solid border-[var(--border-soft)] bg-[var(--surface-root)] px-9 py-10 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
            <p className="m-0 text-[14.5px] leading-[26px] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
              {shown &&
                splitHighlight(shown.text, excerpt).map((fragment, i) =>
                  fragment.mark ? (
                    <mark key={i} className="rounded-[3px] bg-[color-mix(in_srgb,var(--accent-primary)_28%,transparent)] px-0.5 text-inherit">
                      {fragment.text}
                    </mark>
                  ) : (
                    <span key={i}>{fragment.text}</span>
                  )
                )}
            </p>
          </div>
          <p className="mb-0 mt-3 text-center text-[11.5px] text-[var(--text-muted)]">The cited passage is marked. Only the pages around it are shown here.</p>
        </div>
      </aside>
    </div>
  )
}
