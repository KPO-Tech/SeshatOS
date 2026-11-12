import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirmStore } from './confirmAction'

/** The dialog behind confirmAction(), mounted once in the shell. */
export function ConfirmActionHost() {
  const { t } = useTranslation('shell')
  const pending = useConfirmStore((state) => state.pending)
  const answer = useConfirmStore((state) => state.answer)

  useEffect(() => {
    if (!pending) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') answer(false)
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [pending, answer])

  if (!pending) return null
  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && answer(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={pending.message}
        className="w-full max-w-[400px] rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]"
        style={{ animation: 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <p className="m-0 text-[14px] leading-[21px] text-[var(--text-primary)]">{pending.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => answer(false)} className="cursor-pointer rounded-[9px] border border-app-border-subtle bg-transparent px-3.5 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            {t('layout.confirmAction.cancel')}
          </button>
          <button type="button" autoFocus onClick={() => answer(true)} className="cursor-pointer rounded-[9px] border-0 bg-[var(--accent-danger)] px-3.5 py-1.5 text-[13px] font-medium text-white hover:opacity-90">
            {t('layout.confirmAction.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
