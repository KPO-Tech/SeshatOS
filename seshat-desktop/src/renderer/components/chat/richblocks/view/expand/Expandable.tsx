import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const ExpandedContext = createContext(false)

/** True inside the large view, where a component can take more room. */
export const useExpanded = () => useContext(ExpandedContext)

type Props = {
  label: string
  children: ReactNode
  /** Offer the button even when nothing overflows, for a component that is long rather than wide. */
  force?: boolean
  /** Offer the button when the content is taller than this many pixels. */
  maxHeight?: number
  /** Keep the inline content scrollable sideways (a table); a drawing wraps and does not need it. */
  scrollX?: boolean
  /** The frame around the content, in the answer and in the large view. */
  className?: string
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  )
}

function LargeView({ label, onClose, className, children }: { label: string; onClose: () => void; className?: string; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={label} className="flex max-h-full w-full max-w-[min(96vw,1700px)] flex-col overflow-hidden rounded-xl border border-app-border bg-[var(--surface-panel)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-0 border-b border-solid border-app-border-subtle px-4 py-2.5">
          <div className="truncate text-[13px] font-semibold text-app-text">{label}</div>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text">
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-2">
          <ExpandedContext.Provider value>
            <div className={className}>{children}</div>
          </ExpandedContext.Provider>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** Shows the content in the answer and, when it is too big for the column, a button that opens it in a large view. */
export function Expandable({ label, children, force = false, maxHeight, scrollX = false, className = '' }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [tooBig, setTooBig] = useState(false)
  const [open, setOpen] = useState(false)
  const inside = useExpanded()

  useLayoutEffect(() => {
    const element = box.current
    if (!element || inside) return
    const measure = () => {
      const wide = element.scrollWidth > element.clientWidth + 1
      const tall = maxHeight !== undefined && element.scrollHeight > maxHeight
      setTooBig(wide || tall)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [inside, maxHeight, children])

  if (inside) return <>{children}</>
  const offer = force || tooBig

  return (
    <div className={`group/expand relative ${className}`}>
      <div ref={box} className={scrollX ? 'overflow-x-auto' : undefined}>
        {children}
      </div>
      {offer && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Open in a large view"
          aria-label={`Open ${label} in a large view`}
          className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-solid border-app-border-subtle bg-[var(--surface-panel)] text-app-text-secondary opacity-70 shadow-sm transition-opacity hover:bg-[var(--surface-hover)] hover:text-app-text group-hover/expand:opacity-100 focus-visible:opacity-100"
        >
          <ExpandIcon />
        </button>
      )}
      {open && (
        <LargeView label={label} className={className} onClose={() => setOpen(false)}>
          {children}
        </LargeView>
      )}
    </div>
  )
}
