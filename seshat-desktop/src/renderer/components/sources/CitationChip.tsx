import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Right } from '@icon-park/react'

export type CitationPreview = {
  title: string
  meta: string
  // The passage the citation rests on, when there is one.
  excerpt?: string
  // What a click does, in words: "Open at page 12".
  action: string
  mark: (size: number) => ReactNode
}

type Props = {
  mark: ReactNode
  label: string
  preview: CitationPreview
  active?: boolean
  onHover?: (hovering: boolean) => void
  onOpen: () => void
}

const PREVIEW_WIDTH = 300
const GAP = 6
const MARGIN = 8

type Placement = { left: number; top: number; width: number }

// Where the preview goes, from the chip's box and the room there is: under the chip, or above it when there is no room below; as wide as the
// window leaves, up to PREVIEW_WIDTH, and never past the edges. Done on the chip's own position, so that it holds wherever the chip is, in a
// narrow column beside a document as well as in a wide one.
function placePreview(chip: DOMRect, height: number): Placement {
  const width = Math.min(PREVIEW_WIDTH, window.innerWidth - 2 * MARGIN)
  const left = Math.max(MARGIN, Math.min(chip.left, window.innerWidth - width - MARGIN))
  const below = chip.bottom + GAP
  const fitsBelow = below + height <= window.innerHeight - MARGIN
  const top = fitsBelow ? below : Math.max(MARGIN, chip.top - GAP - height)
  return { left, top, width }
}

// A citation inside an answer: the mark of the source and its name, cut when long. Hovering it shows what it points to; clicking opens it.
export function CitationChip({ mark, label, preview, active = false, onHover, onOpen }: Props) {
  const [showing, setShowing] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const chip = useRef<HTMLSpanElement>(null)
  const card = useRef<HTMLSpanElement>(null)

  // The card is measured once drawn, so that it can be put above the chip when it would not fit below.
  useLayoutEffect(() => {
    if (!showing || !chip.current || !card.current) {
      setPlacement(null)
      return
    }
    setPlacement(placePreview(chip.current.getBoundingClientRect(), card.current.offsetHeight))
  }, [showing, preview.excerpt, preview.title, preview.meta])

  const show = () => {
    setShowing(true)
    onHover?.(true)
  }
  const hide = () => {
    setShowing(false)
    onHover?.(false)
  }

  return (
    <span ref={chip} className="relative mx-[3px] inline-block align-[1px]" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <button
        type="button"
        onClick={onOpen}
        className={`inline-flex h-[18px] max-w-[150px] cursor-pointer items-center gap-[3px] rounded-full border border-solid py-0 pl-[3px] pr-1.5 text-[10.5px] font-medium leading-none transition-colors ${
          active
            ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] text-[var(--text-primary)]'
            : 'border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
        }`}
      >
        {mark}
        <span className="truncate">{label}</span>
      </button>

      {showing &&
        createPortal(
          <span
            ref={card}
            className="pointer-events-none fixed z-[300] block rounded-xl border border-solid border-[var(--border-soft)] bg-[var(--surface-menu)] p-3 text-left shadow-[0_16px_34px_rgba(0,0,0,0.28)]"
            style={{ left: placement?.left ?? 0, top: placement?.top ?? 0, width: placement?.width ?? PREVIEW_WIDTH, visibility: placement ? 'visible' : 'hidden', animation: placement ? 'fade-in 140ms ease both' : undefined }}
          >
            <span className="flex items-center gap-2">
              {preview.mark(22)}
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{preview.title}</span>
            </span>
            <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">{preview.meta}</span>
            {preview.excerpt && (
              <span className="mt-2 block border-0 border-l-2 border-solid border-[var(--border-strong)] pl-2.5 text-[12px] leading-[18px] text-[var(--text-secondary)]">{preview.excerpt}</span>
            )}
            <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--accent-primary)]">
              {preview.action}
              <Right size={11} />
            </span>
          </span>,
          document.body
        )}
    </span>
  )
}
