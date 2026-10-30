import { useEffect, useState } from 'react'
import { downloadPng, downloadSvg } from './exportFigure'

const FORMATS = [
  { id: 'png', name: 'PNG image', note: 'Twice the size, sharp' },
  { id: 'svg', name: 'SVG image', note: 'Scales without loss' }
] as const

type Props = {
  label: string
  /** The element to save, read when a format is chosen. */
  target: () => HTMLElement | null | undefined
  /** Classes of the arrow button, so that it fits where it is placed. */
  buttonClassName: string
}

export function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v8M4.5 6.75 8 10.25l3.5-3.5M2.5 13.5h11" />
    </svg>
  )
}

/** A download arrow that opens a menu of formats. Esc closes the menu first. */
export function DownloadMenu({ label, target, buttonClassName }: Props) {
  const [menu, setMenu] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenu(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menu])

  const save = (format: 'svg' | 'png') => {
    const element = target()
    setMenu(false)
    if (!element) return
    setFailed(false)
    try {
      if (format === 'svg') downloadSvg(element, label)
      else void downloadPng(element, label).catch(() => setFailed(true))
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="relative flex items-center">
      {failed && <span className="mr-1 whitespace-nowrap text-xs text-app-error">Could not save the image</span>}
      <button type="button" onClick={() => setMenu((open) => !open)} title="Download" aria-label={`Download ${label}`} aria-haspopup="menu" aria-expanded={menu} className={buttonClassName}>
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
  )
}
