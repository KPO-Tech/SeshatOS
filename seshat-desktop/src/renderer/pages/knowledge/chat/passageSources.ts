import type { Passage } from './knowledgeSearchResults'

export type FileKind = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'md' | 'other'

const KINDS: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'docx',
  docx: 'docx',
  odt: 'docx',
  rtf: 'docx',
  xls: 'xlsx',
  xlsx: 'xlsx',
  csv: 'xlsx',
  ppt: 'pptx',
  pptx: 'pptx',
  md: 'md',
  markdown: 'md',
  txt: 'md'
}

/** The kind of a file, from its name: what decides the icon. */
export function kindOfFile(name: string): FileKind {
  const extension = /\.([a-z0-9]{1,8})$/i.exec(name.trim())?.[1]?.toLowerCase()
  return (extension && KINDS[extension]) || 'other'
}

// What the answer draws on from one document: the passages it took and the pages they come from.
export type PassageGroup = {
  key: string
  title: string
  collection: string
  pages: number[]
  passages: Passage[]
}

/** One entry per document, whatever the number of passages or pages taken from it. A passage with no file name is grouped by its collection. */
export function groupPassages(passages: readonly Passage[]): PassageGroup[] {
  const groups: PassageGroup[] = []
  for (const passage of passages) {
    const key = `${passage.collection}\u0000${passage.file}`
    let group = groups.find((item) => item.key === key)
    if (!group) {
      group = { key, title: passage.file || passage.collection, collection: passage.collection, pages: [], passages: [] }
      groups.push(group)
    }
    group.passages.push(passage)
    for (const page of passage.pages) if (!group.pages.includes(page)) group.pages.push(page)
  }
  for (const group of groups) group.pages.sort((a, b) => a - b)
  return groups
}

/** "p. 12", "pp. 3, 12", or nothing for a document whose pages are unknown. */
export function pagesLabel(pages: readonly number[]): string {
  if (pages.length === 0) return ''
  return pages.length === 1 ? `p. ${pages[0]}` : `pp. ${pages.join(', ')}`
}
