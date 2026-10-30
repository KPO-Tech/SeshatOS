import { useEffect } from 'react'

type Props = {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: Props) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[400px] rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]"
        style={{ animation: 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <h2 className="m-0 text-[17px] font-medium text-[var(--text-primary)]">{title}</h2>
        <p className="mb-0 mt-2.5 text-[13px] leading-[20px] text-[var(--text-secondary)]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-[9px] border border-app-border-subtle bg-transparent px-3.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            Cancel
          </button>
          <button type="button" autoFocus onClick={onConfirm} className="cursor-pointer rounded-[9px] border-0 bg-[var(--accent-danger)] px-3.5 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
