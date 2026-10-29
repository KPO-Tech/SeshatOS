import { HIGHLIGHT_CLASS } from './pdfPassageHighlight'
import { locatePassage, unitsCovering, wordsOf } from './passageLocator'

// The elements of a rendered document that hold text and nothing else: a run of a Word paragraph, a paragraph or a cell of a Markdown note.
const leaves = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('*')).filter((element) => element.childElementCount === 0 && !['SCRIPT', 'STYLE'].includes(element.tagName) && (element.textContent ?? '').trim() !== '')

/** Takes the passage mark off everything a viewer shows. */
export function clearPassageMarks(root: HTMLElement): void {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`))) element.classList.remove(HIGHLIGHT_CLASS)
}

/**
 * Marks, in a document drawn as one flow of text (Word, a Markdown note), the elements that hold the passage, found by words as in a PDF
 * page. Returns the first marked element, or null when the document does not hold the passage.
 */
export function highlightPassageInElement(root: HTMLElement, passage: string): HTMLElement | null {
  const elements = leaves(root)
  const words = elements.map((element) => wordsOf(element.textContent ?? ''))
  const located = locatePassage(words.flat(), wordsOf(passage))
  if (!located) return null
  const covered = unitsCovering(words.map((list) => list.length), located.start, located.end)
  for (const index of covered) elements[index].classList.add(HIGHLIGHT_CLASS)
  return covered.length > 0 ? elements[covered[0]] : null
}
