import { SoftButton, StatusPill } from '../knowledge/KnowledgePrimitives'
import type { AutomationJob, AutomationRun } from './automationTypes'

export function AutomationJobCard({ job, busy, onRun }: { job: AutomationJob; busy: boolean; onRun: (job: AutomationJob) => void }) {
  return (
    <article className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{job.name}</h3>
            <StatusPill tone={job.status === 'active' ? 'ok' : 'muted'}>{job.status || 'unknown'}</StatusPill>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
            {job.description || scheduleLabel(job)}
          </p>
        </div>
        <SoftButton tone="primary" disabled={busy} onClick={() => onRun(job)}>{busy ? 'Running...' : 'Run'}</SoftButton>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Info label="Trigger" value={scheduleLabel(job)} />
        <Info label="Next run" value={formatDate(job.next_run_at)} />
        <Info label="Last status" value={job.last_run_status || 'None'} />
      </div>
    </article>
  )
}

export function AutomationRunRow({ run }: { run: AutomationRun }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{run.job_name || run.job_id}</div>
        <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{formatDate(run.started_at || run.queued_at)}</div>
      </div>
      <StatusPill tone={run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'warn' : 'muted'}>{run.status}</StatusPill>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2.5 py-2">
      <div className="text-[10px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 truncate text-[12px] font-semibold text-[var(--text-secondary)]">{value}</div>
    </div>
  )
}

function scheduleLabel(job: AutomationJob) {
  if (job.trigger_type === 'cron' && job.cron_expr) return job.cron_expr
  if (job.trigger_type === 'interval' && job.interval_seconds) return `Every ${Math.round(job.interval_seconds / 60)} min`
  return job.trigger_type || 'Manual'
}

function formatDate(value?: string) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
