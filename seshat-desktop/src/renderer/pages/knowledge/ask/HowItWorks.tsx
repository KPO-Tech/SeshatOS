import { useEffect, useState } from 'react'
import { BookOpen } from '@icon-park/react'
import { STEPS } from './askContent'

// The button "How it works" and the short explanation it opens: what happens between the question and the answer.
export function HowItWorks() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-[10px] border border-app-border-subtle bg-transparent px-3.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
      >
        <BookOpen size={14} />
        How it works
      </button>

      {open && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] p-6" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)} style={{ animation: 'fade-in 140ms ease both' }}>
          <div role="dialog" aria-modal="true" aria-label="How Ask works" className="w-full max-w-[460px] rounded-[18px] border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]">
            <h2 className="m-0 text-[17px] font-semibold text-[var(--text-primary)]">How Ask works</h2>
            <ol className="m-0 mt-4 flex list-none flex-col gap-3.5 p-0">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-subtle)] text-[12px] font-semibold text-[var(--accent-primary)]">{index + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-[var(--text-primary)]">{step.title}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-[19px] text-[var(--text-muted)]">{step.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="h-9 cursor-pointer rounded-[10px] border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-medium text-white hover:bg-[var(--accent-hover)]">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
