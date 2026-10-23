import type { SourceItem } from '@renderer/components/sources/sourceItem'
import type { KnowledgeCollection, KnowledgeDocument, SourceRef } from '../data/types'
import { FileKindIcon } from './FileKindIcon'
import { groupSources, pagesLabel } from './groupSources'

// The documents an answer draws on as a list of sources: one entry per document, with the pages used. The exact lines are in the
// answer itself, on its citations.
export function documentSourceItems(
  sources: readonly SourceRef[],
  documents: Record<string, KnowledgeDocument>,
  collections: readonly KnowledgeCollection[],
  activeN: number | null,
  onOpen: (source: SourceRef) => void
): SourceItem[] {
  return groupSources(sources).map((group) => {
    const document = documents[group.documentId]
    const collection = collections.find((item) => item.id === document?.collectionId)
    return {
      key: group.documentId,
      title: document?.name ?? 'Document',
      meta: collection?.name ?? '',
      trailing: pagesLabel(group.pages),
      mark: (size) => (document ? <FileKindIcon kind={document.kind} size={size} /> : <span style={{ width: size, height: size }} />),
      onOpen: () => onOpen(group.sources[0]),
      active: group.sources.some((item) => item.n === activeN)
    }
  })
}
