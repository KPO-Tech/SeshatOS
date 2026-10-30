const ENDS_A_SENTENCE = /[.;:?!)]$/
const PAGE_NUMBER = /^\d{1,4}$/

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * The text of a passage as it reads: without the line that only repeats its section path (the result shows the path apart), without the
 * page numbers that stand alone on a line, and without the running header of the page that comes just before such a number. What is left
 * is joined on one line, since the result cuts it to a few lines anyway.
 */
export function cleanExcerpt(text: string, section: string): string {
  const lines = text.split('\n').map((line) => line.trim())
  const kept: string[] = []
  lines.forEach((line, index) => {
    if (line === '') return
    if (index === 0 && section && same(line, section)) return
    if (PAGE_NUMBER.test(line)) return
    const next = lines.slice(index + 1).find((candidate) => candidate !== '')
    const beforeNumber = next !== undefined && PAGE_NUMBER.test(next)
    if (beforeNumber && line.length <= 160 && !ENDS_A_SENTENCE.test(line)) return
    kept.push(line)
  })
  return kept.join(' ')
}
