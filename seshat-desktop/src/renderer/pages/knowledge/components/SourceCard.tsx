import type { KnowledgeDocument, SourceRef } from '../data/types'
import { FileKindIcon } from './FileKindIcon'

type Props = {
  source: SourceRef
  document: KnowledgeDocument | undefined
  collectionName: string | undefined
  active: boolean
  delay?: number
  onOpen: () => void
  onHover: (hovering: boolean) => void
}

// One source of an answer, kept small: the document, where the passage sits, and a short look at the passage. The whole row opens the
// document at its page.
export function SourceCard({ source, document, collectionName, active, delay = 0, onOpen, onHover }: Props) {
  const meta = [collectionName, document?.source].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`flex w-full cursor-pointer gap-3 rounded-xl border border-solid bg-transparent px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 hover:bg-[var(--surface-hover)] ${
        active ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-soft)]'
      }`}
      style={{ animation: `slide-up 320ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both` }}
    >
      {document && <FileKindIcon kind={document.kind} size={28} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{document?.name ?? 'Document'}</span>
          <span className="shrink-0 text-[11px] text-[var(--text-muted)]">p. {source.page}</span>
        </span>
        <span className="block truncate text-[11px] text-[var(--text-muted)]">{meta}</span>
        <span className="mt-1.5 line-clamp-2 block text-[12px] leading-[17px] text-[var(--text-secondary)]">{source.excerpt}</span>
      </span>
    </button>
  )
}
