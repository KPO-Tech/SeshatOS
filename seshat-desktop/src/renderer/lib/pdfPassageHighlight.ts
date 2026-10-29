import { locatePassage, unitsCovering, wordsOf } from './passageLocator'

export const HIGHLIGHT_CLASS = 'passage-highlight'

// The spans of a rendered text layer that hold text. pdf.js wraps some of them in marked-content spans, which hold none themselves.
const leaves = (layer: HTMLElement) =>
  Array.from(layer.querySelectorAll<HTMLElement>('span')).filter((span) => !span.classList.contains('markedContent') && span.childElementCount === 0 && (span.textContent ?? '') !== '')

/** Takes the passage highlight off every page of a viewer. */
export function clearPassageHighlight(container: HTMLElement): void {
  for (const span of Array.from(container.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`))) span.classList.remove(HIGHLIGHT_CLASS)
}

/**
 * Marks, on one rendered page of a pdf.js viewer, the text the passage covers. Returns the first marked span, or null when the page is not
 * rendered yet or does not hold the passage (a scanned page has no text layer).
 */
export function highlightPassageOnPage(container: HTMLElement, pageNumber: number, passage: string): HTMLElement | null {
  const layer = container.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"] .textLayer`)
  if (!layer) return null
  const spans = leaves(layer)
  const words = spans.map((span) => wordsOf(span.textContent ?? ''))
  const located = locatePassage(words.flat(), wordsOf(passage))
  if (!located) return null
  const covered = unitsCovering(words.map((list) => list.length), located.start, located.end)
  for (const index of covered) spans[index].classList.add(HIGHLIGHT_CLASS)
  return covered.length > 0 ? spans[covered[0]] : null
}
