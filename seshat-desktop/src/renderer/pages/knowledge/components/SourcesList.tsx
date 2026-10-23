import type { KnowledgeCollection, KnowledgeDocument, SourceRef } from '../data/types'
import { SourceCard } from './SourceCard'

type Props = {
  sources: SourceRef[]
  documents: Record<string, KnowledgeDocument>
  collections: KnowledgeCollection[]
  activeN: number | null
  onOpen: (source: SourceRef) => void
  onHover: (n: number | null) => void
}

export function SourcesList({ sources, documents, collections, activeN, onOpen, onHover }: Props) {
  return (
    <div className="grid gap-2.5">
      {sources.map((source, index) => {
        const document = documents[source.documentId]
        return (
          <SourceCard
            key={source.n}
            source={source}
            document={document}
            collectionName={collections.find((item) => item.id === document?.collectionId)?.name}
            active={activeN === source.n}
            delay={index * 70}
            onOpen={() => onOpen(source)}
            onHover={(hovering) => onHover(hovering ? source.n : null)}
          />
        )
      })}
    </div>
  )
}
