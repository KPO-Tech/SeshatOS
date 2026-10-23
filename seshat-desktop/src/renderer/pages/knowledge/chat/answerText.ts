// A citation in the answer is the reference the tool gave the excerpt, between square brackets: [k7f3a91]. Markdown draws the text of the
// answer, so each known reference becomes a link to this address, which the page draws as a chip.
export const CITE_PREFIX = '#cite-'

const REF = /\s?\[(k[0-9a-f]{6})\]/g
// A reference still being written at the end of a streamed answer.
const PARTIAL_REF = /\s?\[(?:k[0-9a-f]{0,6})?$/

/** The references an answer cites, once each, in the order they come. */
export function citedRefs(text: string): string[] {
  const refs: string[] = []
  for (const match of text.matchAll(REF)) if (!refs.includes(match[1])) refs.push(match[1])
  return refs
}

/**
 * The answer as Markdown for the page. A reference that matches an excerpt the tool returned becomes a citation link; one that matches
 * none is dropped, so the agent cannot cite what it did not retrieve. A reference still being written is held back.
 */
export function prepareAnswer(text: string, known: ReadonlySet<string>): string {
  return text.replace(PARTIAL_REF, '').replace(REF, (_, ref: string) => (known.has(ref) ? ` [•](${CITE_PREFIX}${ref})` : ''))
}

/** The reference a citation link points to, if the address is one. */
export function refOfHref(href: string | undefined): string | null {
  return href?.startsWith(CITE_PREFIX) ? href.slice(CITE_PREFIX.length) : null
}
