import { useEffect, type ReactNode } from 'react'
import { WindowCloseIcon } from '@renderer/components/ui/WindowControlIcon'

// One shell for every create/edit form across Admin - backdrop, header with
// close, scrollable content, and an action footer. Every sub-feature had its
// own copy-pasted version of this in the old build; keeping it here means
// Escape/click-outside-to-close only has to work once.
export function AdminModal({
  title,
  onClose,
  footer,
  children,
}: {
  title: ReactNode
  onClose: () => void
  footer: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[85vh] w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-soft)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            aria-label="Close"
          >
            <WindowCloseIcon size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--border-soft)] px-5 py-3.5">
          {footer}
        </footer>
      </div>
    </div>
  )
}

// Shared with every text input, textarea, and select across Admin's forms -
// pass via className so native and custom elements look identical.
export const adminInputClass =
  'w-full rounded-md border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]'

export function AdminModalField({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-4 block last:mb-0">
      <span className="mb-1.5 block text-[12px] font-semibold text-[var(--text-secondary)]">
        {label}
        {hint && <span className="ml-1 font-normal text-[var(--text-muted)]">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function AdminModalError({ message }: { message: string }) {
  return (
    <div className="mt-2 rounded-md border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] text-[var(--accent-danger)]">
      {message}
    </div>
  )
}

export function AdminModalButton({
  variant = 'primary',
  disabled,
  onClick,
  children,
}: {
  variant?: 'primary' | 'cancel'
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        variant === 'primary'
          ? 'cursor-pointer rounded-md border-0 bg-[var(--accent-primary)] px-4 py-2 text-[13px] font-semibold text-white disabled:cursor-default disabled:opacity-50'
          : 'cursor-pointer rounded-md border border-[var(--border-soft)] bg-transparent px-4 py-2 text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
      }
    >
      {children}
    </button>
  )
}
