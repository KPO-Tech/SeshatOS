import { HIGHLIGHT_CLASS } from './pdfPassageHighlight'
import { locatePassage, unitsCovering, wordsOf } from './passageLocator'

// The slides of a presentation drawn by pptx-preview: one wrapper per slide, the text of the slide in the elements of its .slide-wrapper
// (the master and the layout have wrappers of their own, with the footers and the numbers, that are not the content).
const SLIDE = '.pptx-preview-slide-wrapper'

const leaves = (slide: HTMLElement) =>
  Array.from(slide.querySelectorAll<HTMLElement>('.slide-wrapper *')).filter((element) => element.childElementCount === 0 && (element.textContent ?? '').trim() !== '')

// The index marks each slide in the text of a passage: "## Slide 5" in the body, or "Slide 5 > Title" at the start of a passage that continues
// a slide.
const SLIDE_MARK = /^(?:#{1,6}\s*)?Slide\s+(\d+)\b/gm

/** The numbers of the slides a passage of a presentation holds, from the marks of its text; empty when the passage names none. */
export function slideNumbersOf(text: string): number[] {
  return Array.from(text.matchAll(SLIDE_MARK), (match) => Number(match[1]))
}

/** The slide number a passage of a presentation starts on, or undefined when its text does not say. */
export function slideNumberOf(text: string): number | undefined {
  return slideNumbersOf(text)[0]
}

/** The passage as the slides show it: without the slide marks and the image notes the index added around the text. */
export function slideText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^(?:#{1,6}\s*)?Slide\s+\d+\s*(?:>.*)?$/.test(line.trim()) && !/^\[Image:[^\]]*\]\s*$/.test(line.trim()))
    .join('\n')
}

type Found = { runs: number; elements: HTMLElement[]; covered: number[] }

/** Takes the passage mark off every slide of a viewer. */
export function clearSlideHighlight(container: HTMLElement): void {
  for (const element of Array.from(container.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`))) element.classList.remove(HIGHLIGHT_CLASS)
}

/**
 * Marks, on the slides of a pptx-preview viewer, the text the passage covers. The slides the passage names are the only ones looked in (the
 * agenda of a deck repeats the titles of the others); a passage that names none is looked for in all of them and marked where it fits best.
 * Returns the first marked element, or null when no slide holds the passage (the text of a picture is not text).
 */
export function highlightPassageInSlides(container: HTMLElement, passage: string): HTMLElement | null {
  const wanted = wordsOf(slideText(passage))
  const named = new Set(slideNumbersOf(passage))
  const found: Found[] = []
  const slides = Array.from(container.querySelectorAll<HTMLElement>(SLIDE))
  for (let index = 0; index < slides.length; index++) {
    if (named.size > 0 && !named.has(index + 1)) continue
    const elements = leaves(slides[index])
    const words = elements.map((element) => wordsOf(element.textContent ?? ''))
    const located = locatePassage(words.flat(), wanted)
    if (located) found.push({ runs: located.runs, elements, covered: unitsCovering(words.map((list) => list.length), located.start, located.end) })
  }
  const kept = named.size > 0 ? found : found.length > 0 ? [found.reduce((a, b) => (b.runs > a.runs ? b : a))] : []
  let first: HTMLElement | null = null
  for (const { elements, covered } of kept) {
    for (const index of covered) {
      elements[index].classList.add(HIGHLIGHT_CLASS)
      first ??= elements[index]
    }
  }
  return first
}

/** The wrapper of slide number n (counted from 1), or null when the presentation has fewer. */
export function slideElement(container: HTMLElement, n: number): HTMLElement | null {
  return container.querySelectorAll<HTMLElement>(SLIDE)[n - 1] ?? null
}
