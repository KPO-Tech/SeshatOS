import { useState } from 'react'
import { Right } from '@icon-park/react'
import type { KnowledgeDocument, SourceRef } from '../data/types'
import { FileKindIcon } from './FileKindIcon'

const DATE = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })

type Props = {
  source: SourceRef
  document: KnowledgeDocument | undefined
  collectionName: string | undefined
  active: boolean
  onHover: (hovering: boolean) => void
  onOpen: () => void
}

// A citation inside the answer: the kind of file and the name of the document, cut when it is long. Hovering it shows the passage and
// where it sits; clicking opens the document at that page.
export function CitationChip({ source, document, collectionName, active, onHover, onOpen }: Props) {
  const [alignRight, setAlignRight] = useState(false)
  const meta = [`Page ${source.page}`, collectionName, document?.source, document ? DATE.format(new Date(document.updatedAt)) : null].filter(Boolean)

  return (
    <span
      className="group relative mx-[3px] inline-block align-[1px]"
      onMouseEnter={(event) => {
        setAlignRight(event.currentTarget.getBoundingClientRect().left > window.innerWidth * 0.5)
        onHover(true)
      }}
      onMouseLeave={() => onHover(false)}
    >
      <button
        type="button"
        onClick={onOpen}
        className={`inline-flex h-[22px] max-w-[190px] cursor-pointer items-center gap-1.5 rounded-full border border-solid py-0 pl-1 pr-2.5 text-[12px] font-medium leading-none transition-colors ${
          active
            ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--text-primary)]'
            : 'border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
        }`}
      >
        {document ? <FileKindIcon kind={document.kind} size={16} /> : <span className="size-4 shrink-0 rounded-full bg-[var(--border-soft)]" />}
        <span className="truncate">{document?.name ?? 'Source'}</span>
      </button>

      <span className={`absolute top-full z-30 hidden pt-1.5 group-focus-within:block group-hover:block ${alignRight ? 'right-0' : 'left-0'}`}>
        <span
          className="block w-[300px] rounded-xl border border-solid border-[var(--border-soft)] bg-[var(--surface-menu)] p-3 text-left shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
          style={{ animation: 'fade-in 140ms ease both' }}
        >
          <span className="flex items-center gap-2">
            {document && <FileKindIcon kind={document.kind} size={22} />}
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{document?.name ?? 'Document'}</span>
          </span>
          <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">{meta.join(' · ')}</span>
          <span className="mt-2 block border-0 border-l-2 border-solid border-[var(--border-strong)] pl-2.5 text-[12px] leading-[18px] text-[var(--text-secondary)]">{source.excerpt}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--accent-primary)]">
            Open at page {source.page}
            <Right size={11} />
          </span>
        </span>
      </span>
    </span>
  )
}
