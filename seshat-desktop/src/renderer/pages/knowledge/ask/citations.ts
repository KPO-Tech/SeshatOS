export type AnswerPart = { type: 'text'; value: string } | { type: 'cite'; n: number }

// Splits an answer into text and numbered markers. A marker still being written at the end of a streamed answer ("[" or "[1") is
// held back, so the reader never sees half of one.
export function splitAnswer(text: string): AnswerPart[] {
  const complete = text.replace(/\s?\[\d{0,2}$/, '')
  const parts: AnswerPart[] = []
  let last = 0
  for (const match of complete.matchAll(/\s?\[(\d{1,2})\]/g)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ type: 'text', value: complete.slice(last, index) })
    parts.push({ type: 'cite', n: Number(match[1]) })
    last = index + match[0].length
  }
  if (last < complete.length) parts.push({ type: 'text', value: complete.slice(last) })
  return parts
}
