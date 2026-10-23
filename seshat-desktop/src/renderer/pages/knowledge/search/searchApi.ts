import { api } from '@renderer/api/client'
import type { Passage } from '../chat/knowledgeSearchResults'

// The cap on passages of one search of the backend (MaxSearchTopK).
export const MAX_PASSAGES = 20

type ResultRow = {
  key: string
  text: string
  score: number
  metadata?: Record<string, string>
  corpus_id: string
  corpus_name: string
}

export type SearchOutcome = { passages: Passage[]; collectionsSearched: number }

// The pages of a chunk as its metadata writes them: "[3,4]".
function pagesOf(raw: string | undefined): number[] {
  return (raw ?? '')
    .replace(/[[\]\s]/g, '')
    .split(',')
    .map(Number)
    .filter((page) => Number.isInteger(page) && page > 0)
}

/** The passages that match a query in the collections the person can read, or in one, best first. No language model is involved. */
export async function searchPassages(query: string, collectionId: string | null): Promise<SearchOutcome> {
  const data = await api.post<{ results?: ResultRow[]; corpora_searched?: number }>('/knowledge/search', {
    query,
    top_k: MAX_PASSAGES,
    ...(collectionId ? { corpus_id: collectionId } : {})
  })
  return {
    collectionsSearched: data.corpora_searched ?? 0,
    passages: (data.results ?? []).map((row) => ({
      ref: row.key,
      score: row.score,
      collection: row.corpus_name,
      file: row.metadata?.filename ?? '',
      pages: pagesOf(row.metadata?.page_numbers),
      section: row.metadata?.heading_path ?? '',
      text: row.text
    }))
  }
}
