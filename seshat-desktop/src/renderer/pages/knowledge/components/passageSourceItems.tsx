import type { SourceItem } from '@renderer/components/sources/sourceItem'
import type { Passage } from '../chat/knowledgeSearchResults'
import { groupPassages, kindOfFile, pagesLabel } from '../chat/passageSources'
import { FileKindIcon } from './FileKindIcon'

// The documents an answer draws on as a list of sources: one entry per document, with the pages used. The exact lines are in the answer
// itself, on its citations.
export function passageSourceItems(passages: readonly Passage[], activeRef: string | null, onOpen: (passage: Passage) => void): SourceItem[] {
  return groupPassages(passages).map((group) => ({
    key: group.key,
    title: group.title,
    meta: group.passages[0].file ? group.collection : '',
    trailing: pagesLabel(group.pages),
    mark: (size) => <FileKindIcon kind={kindOfFile(group.passages[0].file)} size={size} />,
    onOpen: () => onOpen(group.passages[0]),
    active: group.passages.some((passage) => passage.ref === activeRef)
  }))
}
