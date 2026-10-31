/**
 * The line that says what a project is, taken from its README: the first sentence of the first paragraph that is prose. A README starts
 * with a title, badges, a picture or a table of contents, none of which says anything about the project, so those are passed over.
 */
export function descriptionFromReadme(markdown: string, maxLength = 220): string {
  const text = markdown
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---\n/, '') // front matter
    .replace(/<!--[\s\S]*?-->/g, '') // comments
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '') // fenced code

  for (const block of text.split(/\n\s*\n/)) {
    const prose = proseOf(block)
    if (prose) return firstSentence(prose, maxLength)
  }
  return ''
}

/** The text of a block when it is a paragraph of prose, and an empty string for a title, a list, a table, a badge or a picture. */
function proseOf(block: string): string {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return ''
  const first = lines[0]
  if (/^#{1,6}\s/.test(first)) return '' // a title
  if (/^(=+|-+)$/.test(lines[1] ?? '')) return '' // a title underlined
  if (/^(!\[|\[!\[|<|\||[-*+]\s|\d+[.)]\s|\[[^\]]+\]:\s|={3,}|-{3,}|\*{3,})/.test(first)) return '' // a picture, a badge, markup, a table, a list, a rule

  const cleaned = lines
    .map((line) => line.replace(/^>\s?/, '')) // a quoted tagline is still the tagline
    .join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // pictures
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links keep their words
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '') // inline html
    .replace(/(\*\*|__|\*|_|`)/g, '') // emphasis and code marks
    .replace(/\s+/g, ' ')
    .trim()
  // Something that is not a sentence of words (a version, a command, a name on its own) says nothing about the project.
  return cleaned.length >= 20 && /\p{L}{3,}\s+\p{L}{2,}/u.test(cleaned) ? cleaned : ''
}

/** The text up to the end of its first sentence: a full stop, a question or an exclamation mark that a capital letter or the end follows. */
function firstSentence(paragraph: string, maxLength: number): string {
  const match = paragraph.match(/^(.+?[.!?])(?=\s+[\p{Lu}"'([]|$)/u)
  const sentence = match ? match[1] : paragraph
  if (sentence.length <= maxLength) return sentence
  const cut = sentence.slice(0, maxLength)
  const space = cut.lastIndexOf(' ')
  return `${(space > maxLength * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}...`
}
