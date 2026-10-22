import { formatBytes } from './setupFormat'
import type { Progress } from './useSetup'

const LABELS = { title: 'Smart titles', speech: 'Voice dictation' } as const

function Status({ status }: { status: 'waiting' | 'running' | 'done' | 'error' }) {
  if (status === 'done') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-[var(--accent-success)]" aria-label="Done">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-[var(--accent-danger)] text-[13px] font-bold text-white" aria-label="Failed">
        !
      </span>
    )
  }
  if (status === 'running') {
    return <span className="size-6 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent-primary)]" aria-label="Downloading" />
  }
  return <span className="size-6 rounded-full border-2 border-dashed border-[var(--border-strong)]" aria-label="Waiting" />
}

// The items being downloaded, one line each, with how far each one is.
export function InstallProgress({ progress }: { progress: Progress }) {
  const items = (Object.keys(LABELS) as Array<keyof typeof LABELS>).filter((id) => progress[id])
  return (
    <ul className="m-0 grid list-none gap-3 p-0">
      {items.map((id) => {
        const item = progress[id]!
        const percent = item.status === 'done' ? 100 : item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : 0
        return (
          <li key={id} className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-5 py-4">
            <div className="flex items-center gap-3">
              <Status status={item.status} />
              <span className="flex-1 text-[15px] font-semibold text-[var(--text-primary)]">{LABELS[id]}</span>
              <span className="text-[12.5px] text-[var(--text-muted)]">
                {item.status === 'running' && item.totalBytes > 0 && `${formatBytes(item.receivedBytes)} of ${formatBytes(item.totalBytes)}`}
                {item.status === 'waiting' && 'Waiting'}
                {item.status === 'done' && (item.message === 'Skipped' ? 'Skipped' : 'Ready')}
                {item.status === 'error' && 'Not installed'}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className={['h-full rounded-full transition-[width] duration-300', item.status === 'error' ? 'bg-[var(--accent-danger)]' : 'bg-[var(--accent-primary)]'].join(' ')}
                style={{ width: `${percent}%` }}
              />
            </div>
            {item.status === 'error' && item.message && (
              <p className="m-0 mt-2.5 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">
                {item.message} You can try again later in Config.
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
