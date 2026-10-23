import { useRef, useState } from 'react'
import { Down } from '@icon-park/react'
import type { KnowledgeCollection, KnowledgeDocument, SourceRef } from '../data/types'
import { FileKindIcon } from './FileKindIcon'
import { SourcesList } from './SourcesList'

type Props = {
  sources: SourceRef[]
  documents: Record<string, KnowledgeDocument>
  collections: KnowledgeCollection[]
  activeN: number | null
  onOpen: (source: SourceRef) => void
  onHover: (n: number | null) => void
}

// The sources of an answer, folded at its end: a row that names how many there are, and opens the list when clicked.
export function SourcesDisclosure({ sources, documents, collections, activeN, onOpen, onHover }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const kinds = [...new Set(sources.map((source) => documents[source.documentId]?.kind).filter(Boolean))].slice(0, 3)

  return (
    <div ref={root} className="mt-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
          // Once the list has unfolded, bring its end into view above the composer.
          if (!open) setTimeout(() => root.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 320)
        }}
        className="flex h-9 cursor-pointer items-center gap-2.5 rounded-full border border-solid border-[var(--border-soft)] bg-transparent pl-2 pr-3.5 text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        <span className="flex -space-x-1">
          {kinds.map((kind) => (
            <span key={kind} className="rounded-[8px] ring-2 ring-[var(--surface-root)]">
              {kind && <FileKindIcon kind={kind} size={20} />}
            </span>
          ))}
        </span>
        <span>
          {sources.length} {sources.length === 1 ? 'source' : 'sources'}
        </span>
        <Down size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="pt-3" inert={!open}>
            <SourcesList sources={sources} documents={documents} collections={collections} activeN={activeN} onOpen={onOpen} onHover={onHover} />
          </div>
        </div>
      </div>
    </div>
  )
}
