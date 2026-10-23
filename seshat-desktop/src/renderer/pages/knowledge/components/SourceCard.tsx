import { Right } from '@icon-park/react'
import type { KnowledgeDocument, SourceRef } from '../data/types'
import { FileKindIcon } from './FileKindIcon'

const DATE = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })

type Props = {
  source: SourceRef
  document: KnowledgeDocument | undefined
  collectionName: string | undefined
  active: boolean
  delay?: number
  onOpen: () => void
  onHover: (hovering: boolean) => void
}

// One numbered source of an answer: the document, where the passage sits, and the passage itself. Opens the document at its page.
export function SourceCard({ source, document, collectionName, active, delay = 0, onOpen, onHover }: Props) {
  const meta = [`Page ${source.page}`, collectionName, document?.source, document ? DATE.format(new Date(document.updatedAt)) : null].filter(Boolean)
  return (
    <article
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`rounded-xl border bg-[var(--surface-panel)] p-3.5 transition-[border-color,box-shadow,transform] duration-150 ${
        active ? 'border-[var(--accent-primary)] shadow-[0_0_0_3px_var(--accent-subtle)]' : 'border-[var(--border-soft)]'
      }`}
      style={{ animation: `slide-up 320ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both` }}
    >
      <header className="flex items-center gap-2.5">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--accent-subtle)] text-[10.5px] font-bold text-[var(--accent-primary)]">
          {source.n}
        </span>
        {document && <FileKindIcon kind={document.kind} size={24} />}
        <h3 className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">{document?.name ?? 'Document'}</h3>
      </header>
      <p className="mb-0 mt-1.5 truncate text-[11.5px] text-[var(--text-muted)]">{meta.join(' · ')}</p>
      <blockquote className="mx-0 mb-0 mt-2.5 line-clamp-4 border-0 border-l-2 border-solid border-[var(--border-strong)] py-0.5 pl-3 text-[12.5px] leading-[19px] text-[var(--text-secondary)]">
        {source.excerpt}
      </blockquote>
      <button
        type="button"
        onClick={onOpen}
        className="mt-2.5 -ml-1 inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[12px] font-semibold text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-subtle)]"
      >
        Open at page {source.page}
        <Right size={12} />
      </button>
    </article>
  )
}
