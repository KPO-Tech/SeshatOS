import type { ReactNode } from 'react'

export const inputClass = 'h-10 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]'
export const selectClass = 'h-10 w-full rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]'

export function FieldLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['mb-1.5 text-[12.5px] font-semibold text-[var(--text-primary)]', className ?? ''].join(' ')}>{children}</div>
}

export function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function ModalShell({ title, onClose, width = 560, children }: { title: string; onClose: () => void; width?: number; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-8 py-8 backdrop-blur-sm">
      <div className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] shadow-[0_26px_90px_rgba(0,0,0,0.45)]" style={{ maxWidth: width }}>
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
