import { useEffect, useRef, type ReactNode } from 'react'
import { clearPassageMarks, highlightPassageInElement } from '@renderer/lib/textPassageHighlight'

type Props = {
  // The passage to mark and bring into view; the note is drawn as it is without one.
  highlight?: { text: string; pages: number[] }
  children: ReactNode
}

// A note or a text file shown in the right panel (Markdown, or text in a block), with the passage of a collection marked in it.
export function MarkedNote({ highlight, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    clearPassageMarks(root)
    if (highlight) highlightPassageInElement(root, highlight.text)?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight])
  return <div ref={ref}>{children}</div>
}

/** The lines of a text, each its own element, so that the lines of a passage can be marked in a text shown in a block. */
export function textLines(text: string): ReactNode {
  return text.split('\n').map((line, index) => <span key={index}>{`${line}\n`}</span>)
}
