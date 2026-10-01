import { useEffect, useState } from 'react'
import { fetchAutomationJobRuns } from '@renderer/components/config/automation/automationApi'
import type { AutomationJob, AutomationRun } from '@renderer/components/config/automation/automationTypes'
import { ModalShell } from './scheduleFormParts'
import { formatRunTime, runDuration, runStatusLabel, sortRuns } from './runFormatting'

const STATUS_TONE: Record<string, string> = {
  completed: 'text-[var(--accent-success)]',
  failed: 'text-[var(--accent-danger)]',
  cancelled: 'text-[var(--text-muted)]'
}

export function RunHistoryModal({ job, onClose }: { job: AutomationJob; onClose: () => void }) {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAutomationJobRuns(job.id)
      .then((list) => { if (!cancelled) setRuns(sortRuns(list)) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the run history.') })
    return () => { cancelled = true }
  }, [job.id])

  return (
    <ModalShell title={`Run history · ${job.name}`} onClose={onClose} width={680}>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error ? (
          <p className="text-[12.5px] font-semibold text-[var(--accent-danger)]">{error}</p>
        ) : runs === null ? (
          <p className="text-[13px] text-[var(--text-muted)]">Loading...</p>
        ) : runs.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--text-muted)]">No runs yet. Use "Run now" or wait for the next scheduled execution.</p>
        ) : (
          <div className="grid gap-2.5">
            {runs.map((run) => <RunRow key={run.id} run={run} />)}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

function RunRow({ run }: { run: AutomationRun }) {
  const [traceOpen, setTraceOpen] = useState(false)
  const duration = runDuration(run)
  const trace = run.node_trace ?? []

  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
      <div className="flex items-center justify-between gap-3 text-[12.5px]">
        <span className="text-[var(--text-secondary)]">{formatRunTime(run)}{duration ? ` · ${duration}` : ''}</span>
        <span className={['font-semibold', STATUS_TONE[run.status] ?? 'text-[var(--text-primary)]'].join(' ')}>{runStatusLabel(run.status)}</span>
      </div>
      {run.error_text && <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-5 text-[var(--accent-danger)]">{run.error_text}</p>}
      {run.output_text && <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-[var(--text-secondary)]">{run.output_text}</p>}
      {trace.length > 0 && (
        <>
          <button type="button" onClick={() => setTraceOpen((open) => !open)} className="mt-2 text-[12px] font-semibold text-[var(--accent-primary)] hover:opacity-80">
            {traceOpen ? 'Hide steps' : `Show ${trace.length} step${trace.length === 1 ? '' : 's'}`}
          </button>
          {traceOpen && (
            <ul className="mt-2 grid gap-1">
              {trace.map((node) => (
                <li key={node.id} className="flex items-baseline gap-2 text-[11.5px]">
                  <span className={node.skipped ? 'text-[var(--text-muted)]' : node.success ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'}>{node.skipped ? '—' : node.success ? '✓' : '✕'}</span>
                  <span className="font-semibold text-[var(--text-primary)]">{node.id}</span>
                  <span className="text-[var(--text-muted)]">{node.type}</span>
                  {typeof node.duration_ms === 'number' && <span className="text-[var(--text-muted)]">{node.duration_ms}ms</span>}
                  {node.error && <span className="min-w-0 truncate text-[var(--accent-danger)]">{node.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
