import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { downloadPng, downloadSvg } from './exportFigure'

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

const FORMATS = [
  { id: 'png', name: 'PNG image', note: 'Twice the size, sharp' },
  { id: 'svg', name: 'SVG image', note: 'Scales without loss' }
] as const

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v8M4.5 6.75 8 10.25l3.5-3.5M2.5 13.5h11" />
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
  const figure = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const [menu, setMenu] = useState(false)

  const save = (format: 'svg' | 'png') => {
    const element = figure.current
    if (!element) return
    setMenu(false)
    setFailed(false)
    try {
      if (format === 'svg') downloadSvg(element, label)
      else void downloadPng(element, label).catch(() => setFailed(true))
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => close.current?.focus(), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (menu) setMenu(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, menu])

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={label} className="flex max-h-full w-full max-w-[min(96vw,1700px)] flex-col overflow-hidden rounded-xl border border-app-border bg-[var(--surface-panel)] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-0 border-b border-solid border-app-border-subtle px-4 py-2.5">
          <div className="truncate text-[13px] font-semibold text-app-text">{label}</div>
          <div className="flex shrink-0 items-center gap-1">
            {failed && <span className="mr-1 text-xs text-app-error">Could not save the image</span>}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((open) => !open)}
                title="Download"
                aria-label="Download"
                aria-haspopup="menu"
                aria-expanded={menu}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text"
              >
                <DownloadIcon />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onMouseDown={() => setMenu(false)} />
                  <div role="menu" className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-app-border bg-app-surface-elevated p-1 shadow-[var(--shadow-medium)]">
                    {FORMATS.map((format) => (
                      <button
                        key={format.id}
                        type="button"
                        role="menuitem"
                        onClick={() => save(format.id)}
                        className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                      >
                        <span className="text-[13px] font-medium text-app-text">{format.name}</span>
                        <span className="text-[11px] text-app-text-muted">{format.note}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button ref={close} type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-app-text-secondary hover:bg-[var(--surface-hover)] hover:text-app-text">
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-5 pt-2">
          <ExpandedContext.Provider value>
            <div ref={figure} className={`w-fit min-w-full ${className ?? ''}`}>
              {children}
            </div>
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
