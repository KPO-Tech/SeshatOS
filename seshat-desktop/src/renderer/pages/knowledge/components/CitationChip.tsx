import { CitationChip as Chip } from '@renderer/components/sources/CitationChip'
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

// A citation of an answer: the kind of file and the name of the document. Hovering it shows the passage and where it sits; clicking
// opens the document at that page.
export function CitationChip({ source, document, collectionName, active, onHover, onOpen }: Props) {
  const mark = (size: number) => (document ? <FileKindIcon kind={document.kind} size={size} /> : <span className="shrink-0 rounded-full bg-[var(--border-soft)]" style={{ width: size, height: size }} />)
  const meta = [`Page ${source.page}`, collectionName, document?.source, document ? DATE.format(new Date(document.updatedAt)) : null].filter(Boolean)

  return (
    <Chip
      mark={mark(14)}
      label={document?.name ?? 'Source'}
      active={active}
      onHover={onHover}
      onOpen={onOpen}
      preview={{ title: document?.name ?? 'Document', meta: meta.join(' · '), excerpt: source.excerpt, action: `Open at page ${source.page}`, mark }}
    />
  )
}
