import type { Passage } from '@renderer/pages/knowledge/chat/knowledgeSearchResults'
import { groupPassages } from '@renderer/pages/knowledge/chat/passageSources'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** "6 passages from 3 documents", or nothing when nothing came back. */
export function searchSummary(passages: readonly Passage[]): string {
  if (passages.length === 0) return ''
  return `${plural(passages.length, 'passage', 'passages')} from ${plural(groupPassages(passages).length, 'document', 'documents')}`
}

/** A match score (0 to 1) as a whole percentage, kept inside the bounds. */
export function relevance(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

/** A section path as a breadcrumb: "A > B" is shown "A › B". */
export function sectionTrail(section: string): string {
  return section
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' › ')
}

/** The excerpt without the line that only repeats its section path, which the passage already shows above it. */
export function excerptBody(text: string, section: string): string {
  const [first, ...rest] = text.split('\n')
  const same = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase()
  return section && same(first) === same(section) ? rest.join('\n').trim() : text
}

/** Long enough that a clamped view hides some of it. */
export const isLongExcerpt = (text: string) => text.length > 320 || text.split('\n').length > 5
