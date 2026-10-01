import { useCallback, useEffect, useState } from 'react'
import {
  fetchAutomationJobs,
  fetchAutomationStatus,
  pauseAutomationJob,
  resumeAutomationJob,
  triggerAutomationJob
} from '@renderer/components/config/automation/automationApi'
import type { AutomationJob, AutomationStatus } from '@renderer/components/config/automation/automationTypes'
import { useDialogsStore } from '@renderer/stores/dialogs'
import { RunHistoryModal } from './RunHistoryModal'
import { ScheduleCalendarTab } from './ScheduleCalendarTab'
import { ScheduleFormModal } from './ScheduleFormModal'
import { ScheduleTasksTab } from './ScheduleTasksTab'
import { ScheduleTemplatesTab } from './ScheduleTemplatesTab'
import { templateToDraft, type ScheduleDraft, type ScheduleTemplate } from './scheduleTemplates'

type Tab = 'calendar' | 'tasks' | 'templates'

// `editingJob` doubles as the modal's open/closed flag: undefined means
// closed, null means "create new", an AutomationJob means "edit this one" -
// avoids a separate boolean that could drift out of sync with which job (if
// any) the form should show.
export function SchedulingPage() {
  const openConfig = useDialogsStore((state) => state.openConfig)
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('calendar')
  const [editingJob, setEditingJob] = useState<AutomationJob | null | undefined>(undefined)
  // Set when a new task starts from a template; only used while editingJob is null.
  const [draft, setDraft] = useState<ScheduleDraft | undefined>(undefined)
  const [historyJob, setHistoryJob] = useState<AutomationJob | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextStatus = await fetchAutomationStatus()
      setStatus(nextStatus)
      if (nextStatus.connected) {
        const list = await fetchAutomationJobs()
        // Graph (workflow) jobs live exclusively in Config > Automation -
        // this list is prompt-only, mirroring that page's own filter.
        setJobs(list.filter((job) => !job.graph))
      } else {
        setJobs([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scheduled tasks.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleToggle(job: AutomationJob) {
    setBusyId(job.id)
    setError(null)
    try {
      if (job.status === 'active') await pauseAutomationJob(job.id)
      else await resumeAutomationJob(job.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the schedule.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRunNow(job: AutomationJob) {
    setBusyId(job.id)
    setError(null)
    try {
      await triggerAutomationJob(job.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run the task.')
    } finally {
      setBusyId(null)
    }
  }

  function startFromTemplate(template: ScheduleTemplate) {
    setDraft(templateToDraft(template))
    setEditingJob(null)
  }

  function closeForm() {
    setEditingJob(undefined)
    setDraft(undefined)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Scheduling</h1>
        <button
          type="button"
          onClick={() => { setDraft(undefined); setEditingJob(null) }}
          disabled={!status?.connected}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3.5 text-[13px] font-semibold text-[var(--surface-root)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon />
          New schedule
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[13px] font-semibold text-[var(--text-muted)]">Loading...</div>
      ) : !status?.connected ? (
        <NotConnectedState onOpenAutomationConfig={() => openConfig('automation')} />
      ) : (
        <>
          <div className="mt-5 flex shrink-0 gap-4 border-b border-[var(--border-soft)]">
            <TabButton active={tab === 'calendar'} onClick={() => setTab('calendar')}>Calendar</TabButton>
            <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')}>Tasks</TabButton>
            <TabButton active={tab === 'templates'} onClick={() => setTab('templates')}>Templates</TabButton>
          </div>

          {error && (
            <div className="mt-4 shrink-0 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--accent-danger)]">
              {error}
            </div>
          )}

          <div className="mt-5 flex min-h-0 flex-1 flex-col pb-6">
            {tab === 'calendar' ? (
              <ScheduleCalendarTab jobs={jobs} onOpenJob={setEditingJob} />
            ) : tab === 'tasks' ? (
              <ScheduleTasksTab
                jobs={jobs}
                busyId={busyId}
                onEdit={setEditingJob}
                onToggle={(job) => void handleToggle(job)}
                onRunNow={(job) => void handleRunNow(job)}
                onShowRuns={setHistoryJob}
              />
            ) : (
              <ScheduleTemplatesTab onUse={startFromTemplate} />
            )}
          </div>
        </>
      )}

      {editingJob !== undefined && (
        <ScheduleFormModal
          job={editingJob}
          draft={draft}
          onClose={closeForm}
          onSaved={() => {
            closeForm()
            void load()
          }}
        />
      )}

      {historyJob && <RunHistoryModal job={historyJob} onClose={() => setHistoryJob(null)} />}
    </section>
  )
}

function NotConnectedState({ onOpenAutomationConfig }: { onOpenAutomationConfig: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-muted)]">
        <ClockIcon />
      </div>
      <h2 className="mt-5 text-[17px] font-semibold text-[var(--text-primary)]">Connect a Seshat Server to schedule tasks</h2>
      <p className="mt-2 max-w-[420px] text-[13px] leading-6 text-[var(--text-secondary)]">
        Scheduled tasks run on Seshat Server so they fire even while this app is closed. Pair this device from Config → Automation to enable it.
      </p>
      <button
        type="button"
        onClick={onOpenAutomationConfig}
        className="mt-5 flex h-9 items-center rounded-lg border border-[var(--border-soft)] px-4 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
      >
        Open Automation settings
      </button>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative -mb-px h-9 border-b-2 text-[13.5px] font-semibold transition-colors',
        active ? 'border-[var(--accent-primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function PlusIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
}

function ClockIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
}
