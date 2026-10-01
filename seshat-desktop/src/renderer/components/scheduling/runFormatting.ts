import type { AutomationRun } from '@renderer/components/config/automation/automationTypes'

export const RUN_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  claimed: 'Claimed',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

export function runStatusLabel(status: string): string {
  return RUN_STATUS_LABEL[status] ?? status
}

function runTimestamp(run: AutomationRun): number {
  const raw = run.started_at ?? run.queued_at ?? run.finished_at
  const time = raw ? new Date(raw).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

export function formatRunTime(run: AutomationRun): string {
  const raw = run.started_at ?? run.queued_at ?? run.finished_at
  return raw ? new Date(raw).toLocaleString() : 'Not started'
}

// Most recent first.
export function sortRuns(runs: AutomationRun[]): AutomationRun[] {
  return [...runs].sort((a, b) => runTimestamp(b) - runTimestamp(a))
}

// "1m 05s" style; null when the run hasn't both started and finished.
export function runDuration(run: AutomationRun): string | null {
  if (!run.started_at || !run.finished_at) return null
  const ms = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}
