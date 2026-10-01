import { useEffect, useRef, useState } from 'react'
import type { AutomationJob } from '@renderer/components/config/automation/automationTypes'
import { jobScheduleSummary } from './scheduleRecurrence'
import { CopyableUrl, webhookUrl } from './WebhookFields'

export function ScheduleTasksTab({
  jobs,
  busyId,
  onEdit,
  onToggle,
  onRunNow,
  onShowRuns
}: {
  jobs: AutomationJob[]
  busyId: string | null
  onEdit: (job: AutomationJob) => void
  onToggle: (job: AutomationJob) => void
  onRunNow: (job: AutomationJob) => void
  onShowRuns: (job: AutomationJob) => void
}) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center pb-16">
        <p className="text-[13px] font-semibold text-[var(--text-muted)]">No scheduled tasks yet. Start from a template, or create your own with New schedule.</p>
      </div>
    )
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-2.5 pb-8">
        {jobs.map((job) => (
          <TaskCard
            key={job.id}
            job={job}
            busy={busyId === job.id}
            onEdit={() => onEdit(job)}
            onToggle={() => onToggle(job)}
            onRunNow={() => onRunNow(job)}
            onShowRuns={() => onShowRuns(job)}
          />
        ))}
      </div>
    </div>
  )
}

function TaskCard({ job, busy, onEdit, onToggle, onRunNow, onShowRuns }: { job: AutomationJob; busy: boolean; onEdit: () => void; onToggle: () => void; onRunNow: () => void; onShowRuns: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[var(--text-muted)]"><ClockIcon /></span>
          <h3 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{job.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            role="switch"
            aria-checked={job.status === 'active'}
            disabled={busy}
            onClick={onToggle}
            className={[
              'relative h-6 w-10 rounded-full transition-colors disabled:opacity-50',
              job.status === 'active' ? 'bg-[var(--accent-primary)]' : 'bg-[var(--surface-muted)]'
            ].join(' ')}
          >
            <span className={['absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', job.status === 'active' ? 'translate-x-[18px]' : 'translate-x-0.5'].join(' ')} />
          </button>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
              aria-label="Task options"
            >
              <DotsIcon />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-[140px] overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.32)]">
                <button type="button" onClick={() => { setMenuOpen(false); onEdit() }} className="flex h-8 w-full items-center rounded-md px-2 text-left text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
                  Edit
                </button>
                <button type="button" disabled={busy} onClick={() => { setMenuOpen(false); onRunNow() }} className="flex h-8 w-full items-center rounded-md px-2 text-left text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:opacity-40">
                  {busy ? 'Running...' : 'Run now'}
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); onShowRuns() }} className="flex h-8 w-full items-center rounded-md px-2 text-left text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
                  Run history
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {job.prompt && <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-[1.5] text-[var(--text-muted)]">{job.prompt}</p>}

      <div className="mt-3 flex items-center justify-between border-t border-[var(--border-soft)] pt-2.5 text-[11.5px] text-[var(--text-muted)]">
        <span>{jobScheduleSummary(job)}</span>
        {job.last_run_status && <span>Last run: {job.last_run_status}</span>}
      </div>
      {job.webhook_token && (
        <div className="mt-2.5">
          <CopyableUrl url={webhookUrl(job.webhook_token)} />
        </div>
      )}
    </div>
  )
}

function ClockIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
}

function DotsIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3.2" r="1.7" /><circle cx="8" cy="8" r="1.7" /><circle cx="8" cy="12.8" r="1.7" /></svg>
}
