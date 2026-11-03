// A server writes the description of a tool for the model, often as one long block. These split it for a person to read.

export type ToolTextBlock = { kind: 'text' | 'code'; value: string }

const SENTENCE_END = /[.!?](?=\s+[A-Z`{"]|\s*$)/

/** The first sentence of a description, for the row of a tool. */
export function toolSummary(description: string | undefined): string {
  const text = (description ?? '').trim().replace(/\s+/g, ' ')
  const end = text.search(SENTENCE_END)
  return end < 0 ? text : text.slice(0, end + 1)
}

/** Whether the description says more than its summary, so that the row has something to open. */
export function hasToolDetails(description: string | undefined): boolean {
  return toolSummary(description) !== (description ?? '').trim().replace(/\s+/g, ' ')
}

/** Where the JSON object starting at start ends, or -1 when it does not close. Braces in strings do not count. */
function jsonEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let index = start; index < text.length; index++) {
    const char = text[index]
    if (inString) {
      if (char === '\\') index++
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) return index
    }
  }
  return -1
}

function pushText(blocks: ToolTextBlock[], text: string) {
  for (const sentence of text.split(/\n+|(?<=[.!?])\s+(?=[A-Z`])/)) {
    const value = sentence.trim().replace(/\s+/g, ' ')
    if (value) blocks.push({ kind: 'text', value })
  }
}

/** The whole description as sentences and code, a JSON example being code: one block per line to read. */
export function toolTextBlocks(description: string | undefined): ToolTextBlock[] {
  const text = (description ?? '').trim()
  const blocks: ToolTextBlock[] = []
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf('{"', cursor)
    const end = start < 0 ? -1 : jsonEnd(text, start)
    if (end < 0) {
      pushText(blocks, text.slice(cursor))
      break
    }
    pushText(blocks, text.slice(cursor, start))
    blocks.push({ kind: 'code', value: text.slice(start, end + 1) })
    cursor = end + 1
  }
  return blocks
}

/** The tools matching what the person typed, by name or description. */
export function filterTools<T extends { name: string; description?: string }>(tools: T[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tools
  return tools.filter((tool) => tool.name.toLowerCase().includes(needle) || (tool.description ?? '').toLowerCase().includes(needle))
}
