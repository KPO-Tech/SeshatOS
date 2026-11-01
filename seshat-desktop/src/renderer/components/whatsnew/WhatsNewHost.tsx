import { useEffect, useState } from 'react'
import { Close } from '@icon-park/react'
import { getSeenVersion, OPEN_WHATS_NEW_EVENT, RELEASES, releaseToShow, setSeenVersion, type ReleaseNotes } from '@renderer/lib/whatsNew'
import { WhatsNewVisual } from './visuals'

/** Opens the card of what changed once after an update, and whenever the person asks for it from the menu of the sidebar. */
export function WhatsNewHost() {
  const [release, setRelease] = useState<ReleaseNotes | null>(null)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.seshat
      ?.getVersion()
      .then((current) => {
        if (cancelled) return
        setVersion(current)
        const seen = getSeenVersion()
        // A first install has nothing to compare with: it starts from the version it came with.
        if (!seen) setSeenVersion(current)
        else setRelease(releaseToShow(current, seen))
      })
      .catch(() => undefined)
    function onOpen() {
      setRelease(RELEASES[0] ?? null)
    }
    window.addEventListener(OPEN_WHATS_NEW_EVENT, onOpen)
    return () => {
      cancelled = true
      window.removeEventListener(OPEN_WHATS_NEW_EVENT, onOpen)
    }
  }, [])

  function close() {
    if (version) setSeenVersion(version)
    setRelease(null)
  }

  if (!release) return null
  return <WhatsNewCard release={release} onClose={close} />
}

function WhatsNewCard({ release, onClose }: { release: ReleaseNotes; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const last = release.highlights.length - 1
  const highlight = release.highlights[index]

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(last, value + 1))
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last, onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`What's new in SeshatOS ${release.version}`} className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-primary)]">New in {release.version}</span>
            <h2 className="m-0 mt-1 text-[19px] font-semibold leading-tight text-[var(--text-primary)]">{release.headline}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]">
            <Close theme="outline" size={15} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <WhatsNewVisual key={highlight.id} id={highlight.id} />
          <div className="py-4" key={`${highlight.id}-text`} style={{ animation: 'fade-in 240ms ease both' }}>
            <h3 className="m-0 text-[17px] font-semibold text-[var(--text-primary)]">{highlight.title}</h3>
            <p className="m-0 mt-1.5 text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">{highlight.text}</p>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-[var(--border-soft)] px-6 py-3.5">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Changes">
            {release.highlights.map((item, position) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={position === index}
                aria-label={item.title}
                onClick={() => setIndex(position)}
                className={`h-2 cursor-pointer rounded-full border-0 p-0 transition-all duration-200 ${position === index ? 'w-5 bg-[var(--accent-primary)]' : 'w-2 bg-[var(--border-strong)] hover:bg-[var(--text-muted)]'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button type="button" onClick={() => setIndex(index - 1)} className="h-9 cursor-pointer rounded-xl border border-[var(--border-soft)] bg-transparent px-4 text-[13px] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]">
                Back
              </button>
            )}
            {index < last ? (
              <button type="button" onClick={() => setIndex(index + 1)} className="h-9 cursor-pointer rounded-xl border-0 bg-[var(--accent-primary)] px-5 text-[13px] font-semibold text-white hover:brightness-110">
                Next
              </button>
            ) : (
              <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-xl border-0 bg-[var(--accent-primary)] px-5 text-[13px] font-semibold text-white hover:brightness-110">
                Got it
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
