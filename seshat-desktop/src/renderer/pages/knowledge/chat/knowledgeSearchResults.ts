// One excerpt the knowledge_search tool returned: where it comes from, and the passage itself.
export type Passage = {
  // The reference the agent cites it by, written by the tool (k and six hexadecimal digits).
  ref: string
  score: number
  collection: string
  file: string
  pages: number[]
  section: string
  text: string
}

// The line that introduces an excerpt, as seshat-backend/internal/knowledge/tool writes it:
//   [1] ref=k7f3a9 score=0.8123 corpus=Legal file=Supplier contract template.docx pages=12,13 section="Termination"
// file, pages and section are left out when the chunk has none, always in this order.
const HEADER =
  /^\[\d+\] ref=(k[0-9a-f]{6}) score=(-?[\d.]+) corpus=(.*?)(?: file=(.*?))?(?: pages=([\d, ]+?))?(?: section=("(?:[^"\\]|\\.)*"))?$/

function unquote(value: string): string {
  try {
    return JSON.parse(value) as string
  } catch {
    return value.slice(1, -1)
  }
}

/** The excerpts in the text a knowledge_search call returned, in order. A text with no excerpt (nothing found, an error) gives none. */
export function parseKnowledgeSearchResult(content: string | undefined): Passage[] {
  if (!content) return []
  const passages: Passage[] = []
  let current: Passage | null = null
  const body: string[] = []
  const close = () => {
    if (current) passages.push({ ...current, text: body.join('\n').trim() })
    current = null
    body.length = 0
  }
  for (const line of content.split(/\r?\n/)) {
    const match = HEADER.exec(line)
    if (match) {
      close()
      current = {
        ref: match[1],
        score: Number(match[2]),
        collection: match[3].trim(),
        file: (match[4] ?? '').trim(),
        pages: (match[5] ?? '')
          .split(',')
          .map((page) => Number(page.trim()))
          .filter((page) => Number.isInteger(page) && page > 0),
        section: match[6] ? unquote(match[6]) : '',
        text: ''
      }
    } else if (current) {
      body.push(line)
    }
  }
  close()
  return passages
}
