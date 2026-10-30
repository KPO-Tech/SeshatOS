import { formatBytes, formatDuration, formatRate, remainingSeconds } from './setupFormat'
import { useTransferRate } from './useTransferRate'
import type { Progress } from './useSetup'

const LABELS = { title: 'Smart titles', speech: 'Voice dictation', ocr: 'Scanned documents' } as const

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

type Overall = { receivedBytes: number; totalBytes: number; percent: number }

// The items being downloaded, one line each, with how far each one is. They download at the same time: when the plan is given, a bar above
// shows how far all of it is.
export function InstallProgress({ progress, overall }: { progress: Progress; overall?: Overall }) {
  const rate = useTransferRate(overall?.receivedBytes ?? 0)
  const left = overall ? remainingSeconds(overall.receivedBytes, overall.totalBytes, rate) : null
  const items = (Object.keys(LABELS) as Array<keyof typeof LABELS>).filter((id) => progress[id])
  return (
    <div className="grid gap-3">
      {overall && overall.totalBytes > 0 && (
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold text-[var(--text-primary)]">{overall.percent}%</span>
            <span className="text-[12.5px] text-[var(--text-muted)]">
              {formatBytes(overall.receivedBytes)} of {formatBytes(overall.totalBytes)}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-300" style={{ width: `${overall.percent}%` }} />
          </div>
          {left !== null && (
            <p className="m-0 mt-2.5 text-[12.5px] text-[var(--text-muted)]">
              {formatRate(rate)} · {left < 10 ? 'Almost done' : `About ${formatDuration(left)} left`}
            </p>
          )}
        </div>
      )}
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
                  {item.message} You can try again here, or later in Config.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
