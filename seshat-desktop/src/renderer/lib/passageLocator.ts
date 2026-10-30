// Finds where a passage of a collection (the text of one chunk, as the index holds it) sits in the text of a page of its document.
//
// The two texts do not match letter for letter: the chunk comes from the converted document (Markdown marks, table pipes, a reading order
// of its own) and the page text from the PDF's text layer. So the match is made on words, ignoring marks and case, by short runs of
// consecutive words that both texts share; the place is where the most of them line up.

/** The words of a text, in lower case, with no punctuation or Markdown marks. */
export function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

const RUN = 4
// How far, in words, the page may drift from the passage's own order inside one passage (a table read column by column, a note in between).
const DRIFT = 40
// A passage is located only when at least this many of its runs were found together, so that a coincidence of one phrase is not taken for it.
const MIN_RUNS = 3

export type Located = { start: number; end: number; runs: number }

/**
 * The first and last word of the page (inclusive) that the passage covers, or null when the page does not hold it. A short passage needs
 * every run it has to be found.
 */
export function locatePassage(pageWords: readonly string[], passageWords: readonly string[]): Located | null {
  const size = Math.min(RUN, passageWords.length)
  if (size < 2 || pageWords.length < size) return null

  const at = new Map<string, number[]>()
  for (let p = 0; p + size <= pageWords.length; p++) {
    const key = pageWords.slice(p, p + size).join(' ')
    const list = at.get(key)
    if (list) list.push(p)
    else at.set(key, [p])
  }

  const matches: Array<{ j: number; p: number }> = []
  for (let j = 0; j + size <= passageWords.length; j++) {
    const found = at.get(passageWords.slice(j, j + size).join(' '))
    if (found) for (const p of found) matches.push({ j, p })
  }
  const needed = Math.min(MIN_RUNS, passageWords.length - size + 1)
  if (matches.length < needed) return null

  // The words of the page that line up with the passage share one offset (page position minus passage position); the offset with the most
  // runs near it is where the passage is.
  let best: { diagonal: number; count: number } | null = null
  for (const { j, p } of matches) {
    const diagonal = p - j
    let count = 0
    for (const other of matches) if (Math.abs(other.p - other.j - diagonal) <= DRIFT) count++
    if (!best || count > best.count) best = { diagonal, count }
  }
  if (!best || best.count < needed) return null

  const kept = matches.filter((match) => Math.abs(match.p - match.j - best.diagonal) <= DRIFT)
  return { start: Math.min(...kept.map((match) => match.p)), end: Math.max(...kept.map((match) => match.p + size - 1)), runs: best.count }
}

/** The units (spans of a text layer) that hold the words from start to end, given the words of each unit in order. */
export function unitsCovering(wordsPerUnit: readonly number[], start: number, end: number): number[] {
  const units: number[] = []
  let first = 0
  wordsPerUnit.forEach((count, unit) => {
    const last = first + count - 1
    if (count > 0 && last >= start && first <= end) units.push(unit)
    first += count
  })
  return units
}
