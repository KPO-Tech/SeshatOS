// The words of a query as the search index sees them: letters and digits, case and accents ignored, each once.
export function queryTerms(query: string): string[] {
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? []
  const terms: string[] = []
  for (const word of words) {
    const term = fold(word)
    if (!terms.includes(term)) terms.push(term)
  }
  return terms
}

// Lower case and without accents, one character for one character, so that a position in the folded text is a position in the original.
function fold(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 1) out += text[i].normalize('NFD').charAt(0).toLowerCase()
  return out
}

export type Segment = { text: string; hit: boolean }

/** The text cut in pieces, the words of the query marked. */
export function highlight(text: string, terms: readonly string[]): Segment[] {
  if (terms.length === 0 || text === '') return [{ text, hit: false }]
  const wanted = new Set(terms)
  const folded = fold(text)
  const segments: Segment[] = []
  let last = 0
  for (const match of folded.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (!wanted.has(match[0])) continue
    const start = match.index ?? 0
    if (start > last) segments.push({ text: text.slice(last, start), hit: false })
    segments.push({ text: text.slice(start, start + match[0].length), hit: true })
    last = start + match[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last), hit: false })
  return segments.length > 0 ? segments : [{ text, hit: false }]
}

/** A short piece of the text around the first word of the query it holds, on one line; the beginning of the text when it holds none. */
export function snippet(text: string, terms: readonly string[], max = 260): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const wanted = new Set(terms)
  let first = -1
  for (const match of fold(flat).matchAll(/[\p{L}\p{N}]+/gu)) {
    if (wanted.has(match[0])) {
      first = match.index ?? 0
      break
    }
  }
  if (first < 0) return `${flat.slice(0, max).trimEnd()}...`
  let start = Math.max(0, first - Math.floor(max / 4))
  if (start > 0) {
    const space = flat.indexOf(' ', start)
    if (space !== -1 && space < first) start = space + 1
  }
  const end = Math.min(flat.length, start + max)
  return `${start > 0 ? '...' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '...' : ''}`
}
