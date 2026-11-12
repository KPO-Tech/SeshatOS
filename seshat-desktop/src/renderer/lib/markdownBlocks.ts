// Splits Markdown into top-level blocks that can each be parsed on their own, so an answer being written re-parses only its last block.
//
// A boundary is a blank line between two blocks that do not belong together: never inside a code fence or a $$ math block, and not
// between the items of a list or before an indented line (a list item's continuation, an indented code block), which would change how
// the list is drawn. Anything that needs the whole document (a link reference defined elsewhere, a footnote) is drawn right once the
// answer is complete and parsed as one.

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const MATH_FENCE = /^ {0,3}\$\$\s*$/
const LIST_ITEM = /^ {0,3}([-*+]|\d{1,9}[.)])\s/
const INDENTED = /^(?: {4}|\t)/

export function splitMarkdownBlocks(text: string): string[] {
  if (text.trim() === '') return []
  const lines = text.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let fence: string | null = null
  let inMath = false
  let lastContentLine = ''

  const close = () => {
    if (current.length > 0) blocks.push(current.join('\n'))
    current = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (fence) {
      current.push(line)
      const match = FENCE.exec(line)
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && line.trim() === match[1]) fence = null
      continue
    }
    if (inMath) {
      current.push(line)
      if (MATH_FENCE.test(line)) inMath = false
      continue
    }
    if (line.trim() === '') {
      const next = lines.slice(i + 1).find((candidate) => candidate.trim() !== '')
      const keepsTogether =
        next === undefined ||
        INDENTED.test(next) ||
        (LIST_ITEM.test(next) && (LIST_ITEM.test(lastContentLine) || INDENTED.test(lastContentLine)))
      if (keepsTogether || current.length === 0) current.push(line)
      else close()
      continue
    }
    const opener = FENCE.exec(line)
    if (opener) fence = opener[1]
    else if (MATH_FENCE.test(line)) inMath = true
    current.push(line)
    lastContentLine = line
  }
  close()
  return blocks
}
