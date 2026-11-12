import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Status = { state: 'restarting' | 'ready' | 'failed'; detail?: string }

// How long "back" stays on screen once the backend answers again.
const READY_NOTICE_MS = 4000

/**
 * A line at the top of the window when the local backend stopped by itself: the main process starts it again (backend-process.ts), and
 * until then every call fails. Without it the person would only see errors with no cause.
 */
export function BackendStatusHost() {
  const { t } = useTranslation('shell')
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => window.seshat?.backendStatus?.onChange(setStatus), [])

  useEffect(() => {
    if (status?.state !== 'ready') return
    const timer = window.setTimeout(() => setStatus(null), READY_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  if (!status) return null
  const failed = status.state === 'failed'
  const text =
    status.state === 'restarting'
      ? t('layout.backendStatus.restarting')
      : status.state === 'ready'
        ? t('layout.backendStatus.ready')
        : t('layout.backendStatus.failed')

  return (
    <div className="pointer-events-none fixed left-1/2 top-[44px] z-[2000] -translate-x-1/2">
      <div
        role="status"
        title={status.detail}
        className={[
          'pointer-events-auto flex items-center gap-3 rounded-lg bg-app-surface px-4 py-2 text-[13px] font-medium shadow-[var(--shadow-medium)]',
          failed ? 'border border-[rgba(var(--color-error-rgb),0.4)] text-app-error' : 'border border-app-border-subtle text-app-text-secondary',
        ].join(' ')}
      >
        <span>{text}</span>
        {failed && (
          <button type="button" onClick={() => setStatus(null)} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-app-text-muted hover:text-app-text">
            {t('layout.backendStatus.dismiss')}
          </button>
        )}
      </div>
    </div>
  )
}
