import type { SourceRef } from '../data/types'

export type DocumentSources = {
  documentId: string
  // The passages taken from this document, in the order of the answer.
  sources: SourceRef[]
  // The pages they come from, once each and in order.
  pages: number[]
}

// One entry per document: ten passages from the same document are one source, not ten.
export function groupSources(sources: readonly SourceRef[]): DocumentSources[] {
  const groups: DocumentSources[] = []
  for (const source of sources) {
    let group = groups.find((item) => item.documentId === source.documentId)
    if (!group) {
      group = { documentId: source.documentId, sources: [], pages: [] }
      groups.push(group)
    }
    group.sources.push(source)
    if (!group.pages.includes(source.page)) group.pages.push(source.page)
  }
  for (const group of groups) group.pages.sort((a, b) => a - b)
  return groups
}

export function pagesLabel(pages: readonly number[]): string {
  return pages.length === 1 ? `p. ${pages[0]}` : `pp. ${pages.join(', ')}`
}
