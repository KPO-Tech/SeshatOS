const OPENERS = new Set(
  ('what which who whom whose how why when where should can could would will does did do is are was were am according ' +
    'comment pourquoi quand quel quels quelle quelles qui que quoi ou combien est selon peut peuvent doit dois faut')
    .split(' ')
)

/** True when the query reads as a question put to someone, which the Ask view answers better than a list of passages. */
export function looksLikeQuestion(query: string): boolean {
  const text = query.trim()
  if (text === '') return false
  if (text.endsWith('?')) return true
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
  return words.length >= 4 && OPENERS.has(words[0] ?? '')
}
