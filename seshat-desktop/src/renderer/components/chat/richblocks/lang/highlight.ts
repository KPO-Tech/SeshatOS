// A reader of seshat-ui for colouring: it cuts a line into pieces that say what they are, so that the code of an example can be shown with
// colour codes. It is not the parser: it never fails and keeps every character, so that the pieces put back together are the line.

export type PieceKind = 'name' | 'component' | 'string' | 'number' | 'keyword' | 'punct' | 'ref' | 'space'
export type Piece = { kind: PieceKind; text: string }

const KEYWORDS = new Set(['true', 'false', 'null'])

/** The pieces of one line of seshat-ui: `name = Component(args)`, where args are strings, numbers, true, false, null, lists and names. */
export function highlightLine(line: string): Piece[] {
  const pieces: Piece[] = []
  let i = 0
  let beforeEquals = true
  const push = (kind: PieceKind, text: string) => pieces.push({ kind, text })
  while (i < line.length) {
    const c = line[i]
    if (c === '"') {
      let j = i + 1
      while (j < line.length && line[j] !== '"') j += line[j] === '\\' ? 2 : 1
      push('string', line.slice(i, Math.min(j + 1, line.length)))
      i = Math.min(j + 1, line.length)
    } else if (/\s/.test(c)) {
      let j = i
      while (j < line.length && /\s/.test(line[j])) j++
      push('space', line.slice(i, j))
      i = j
    } else if (/[0-9]/.test(c) || (c === '-' && /[0-9.]/.test(line[i + 1] ?? ''))) {
      let j = i + 1
      while (j < line.length && /[0-9.eE]/.test(line[j])) j++
      push('number', line.slice(i, j))
      i = j
    } else if (/[A-Za-z_@]/.test(c)) {
      let j = i + 1
      while (j < line.length && /[A-Za-z0-9_]/.test(line[j])) j++
      const word = line.slice(i, j)
      if (KEYWORDS.has(word)) push('keyword', word)
      else if (word.startsWith('@') || (/^[A-Z]/.test(word) && line[j] === '(')) push('component', word)
      else push(beforeEquals && /^\s*=/.test(line.slice(j)) ? 'name' : 'ref', word)
      i = j
    } else {
      if (c === '=') beforeEquals = false
      push('punct', c)
      i++
    }
  }
  return pieces
}
