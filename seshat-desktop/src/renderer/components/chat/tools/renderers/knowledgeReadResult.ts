export type ReadWindow = {
  // The characters of the document that this call returned, and how many it has in all.
  from: number
  to: number
  total: number
  // True when this call reached the end of the text: nothing more to read on.
  end: boolean
}

export type ReadPart = { page: number | null; text: string }

export type KnowledgeRead = {
  file: string
  collection: string
  // The pages the call covered, "3-5 of 32", or the number of pages of a document read whole; empty when the document has none.
  pages: string
  window: ReadWindow | null
  // The text, cut at the page markers of a PDF: one part per page, or a single part with no page.
  parts: ReadPart[]
}

const HEADER = /^document=(.*?) corpus=(.*?)(?: (pages=\S+(?: of \d+)?))?(?: (chars=(\d+)-(\d+) of (\d+) \((?:end of the text|read on with offset=\d+)\)))?\s*$/
const PAGE = /^\[page (\d+)\]$/

/** The pages a header names, as a label: "pages=3-5 of 32" is "pp. 3-5 of 32", "pages=32" is "32 pages". */
function pagesLabel(raw: string | undefined): string {
  if (!raw) return ''
  const value = raw.replace(/^pages=/, '')
  return /^\d+$/.test(value) ? `${value} pages` : `pp. ${value}`
}

function splitParts(body: string): ReadPart[] {
  const parts: ReadPart[] = []
  let current: ReadPart = { page: null, text: '' }
  const flush = () => {
    if (current.text.trim() !== '' || current.page !== null) parts.push({ page: current.page, text: current.text.trim() })
  }
  for (const line of body.split('\n')) {
    const match = PAGE.exec(line.trim())
    if (match) {
      flush()
      current = { page: Number(match[1]), text: '' }
    } else {
      current.text += `${line}\n`
    }
  }
  flush()
  return parts
}

/**
 * The text a knowledge_read call returned, as its parts. It is null when the text is not in the shape the tool writes (the document was not
 * found, two collections hold it, it could not be read), so that the message is shown as it is.
 */
export function parseKnowledgeRead(content: string | undefined): KnowledgeRead | null {
  if (!content) return null
  const lines = content.split('\n')
  const at = lines.findIndex((line) => line.startsWith('document='))
  if (at === -1) return null
  const match = HEADER.exec(lines[at])
  if (!match) return null
  const to = match[6] ? Number(match[6]) : 0
  const total = match[7] ? Number(match[7]) : 0
  return {
    file: match[1],
    collection: match[2],
    pages: pagesLabel(match[3]),
    window: match[4] ? { from: Number(match[5]), to, total, end: to >= total } : null,
    parts: splitParts(lines.slice(at + 1).join('\n'))
  }
}
