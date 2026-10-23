import type { KnowledgeDocument } from '../data/types'
import { FileKindIcon } from './FileKindIcon'
import { pagesLabel, type DocumentSources } from './groupSources'

type Props = {
  group: DocumentSources
  document: KnowledgeDocument | undefined
  collectionName: string | undefined
  active: boolean
  delay?: number
  onOpen: () => void
}

// A document an answer draws on, once, with the pages used. The exact lines are in the answer itself, on its citations.
export function DocumentRow({ group, document, collectionName, active, delay = 0, onOpen }: Props) {
  const meta = [collectionName, document?.source].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border border-solid bg-transparent px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 hover:bg-[var(--surface-hover)] ${
        active ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-soft)]'
      }`}
      style={{ animation: `slide-up 320ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both` }}
    >
      {document && <FileKindIcon kind={document.kind} size={30} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{document?.name ?? 'Document'}</span>
        <span className="block truncate text-[11px] text-[var(--text-muted)]">{meta}</span>
      </span>
      <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{pagesLabel(group.pages)}</span>
    </button>
  )
}
