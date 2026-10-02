export type RagResult = {
  index: number
  score: number
  corpus: string
  file?: string
  text: string
}

// Matches the header line seshat-backend's knowledge_search tool writes per
// result (internal/knowledge/tool/search.go formatResults):
//   [1] score=0.8123 corpus=HR Policies file=handbook.pdf
const HEADER = /^\[(\d+)\] score=([\d.]+) corpus=(.*?)(?: file=(.*))?$/

// Splits knowledge_search's plain-text output into structured results.
// Returns null when the text isn't in that shape (an error message, "No
// results found", or a format change), so callers fall back to showing the
// raw text instead of an empty or misleading list.
export function parseRagResults(content: string): RagResult[] | null {
  const results: RagResult[] = []
  let current: RagResult | null = null
  const body: string[] = []

  const flush = () => {
    if (!current) return
    current.text = body.join('\n').trim()
    results.push(current)
    body.length = 0
  }

  for (const line of content.split('\n')) {
    const match = HEADER.exec(line)
    if (match) {
      flush()
      current = {
        index: Number(match[1]),
        score: Number(match[2]),
        corpus: match[3],
        file: match[4] || undefined,
        text: '',
      }
    } else if (current) {
      body.push(line)
    }
  }
  flush()

  return results.length > 0 ? results : null
}
