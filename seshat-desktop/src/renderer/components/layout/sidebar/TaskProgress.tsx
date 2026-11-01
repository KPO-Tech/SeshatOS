import { useEffect, useState } from 'react'
import { CheckOne, CloseOne, Down, Loading, Up } from '@icon-park/react'
import { elapsedLabel, finishedMessage, progressOf, stepLabel } from '@renderer/lib/taskView'
import { cancelTask, isTaskActive, type TaskInfo } from '@renderer/lib/tasks'
import { nudgeTasks, useTasksStore } from '@renderer/stores/tasks'
import { useUIStore } from '@renderer/stores/ui'

/** How long a task that went well stays in the sidebar; one that failed stays until it is dismissed. */
const GOOD_NEWS_MS = 8000

function useNowSeconds(active: boolean) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-[var(--border-soft)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-500" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}

function ActiveTask({ task, now, detailed }: { task: TaskInfo; now: number; detailed: boolean }) {
  async function stop() {
    try {
      await cancelTask(task.id)
    } finally {
      nudgeTasks()
    }
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12.5px] font-medium text-[var(--text-primary)]">{task.title}</span>
        {detailed && (
          <button type="button" onClick={() => void stop()} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--accent-danger)]">
            Cancel
          </button>
        )}
      </div>
      <Bar value={progressOf(task)} />
      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
        <span className="min-w-0 truncate">{stepLabel(task)}</span>
        <span className="shrink-0">{elapsedLabel(task, now)}</span>
      </div>
      {detailed && task.detail && <div className="truncate font-mono text-[10.5px] text-[var(--text-faint)]" title={task.detail}>{task.detail}</div>}
    </div>
  )
}

function Finished({ task }: { task: TaskInfo }) {
  const dismiss = useTasksStore((state) => state.dismiss)
  const message = finishedMessage(task)
  useEffect(() => {
    if (message.failed) return
    const timer = setTimeout(() => dismiss(task.id), GOOD_NEWS_MS)
    return () => clearTimeout(timer)
  }, [task.id, message.failed, dismiss])
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-px shrink-0 ${message.failed ? 'text-[var(--accent-danger)]' : 'text-[var(--accent-success)]'}`}>
        {message.failed ? <CloseOne theme="filled" size={14} fill="currentColor" /> : <CheckOne theme="filled" size={14} fill="currentColor" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-[var(--text-primary)]">{message.title}</div>
        {message.failed && <div className="line-clamp-2 text-[11px] text-[var(--text-muted)]">{message.body}</div>}
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(task.id)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <CloseOne theme="outline" size={13} />
      </button>
    </div>
  )
}

/** What the background tasks are doing, at the bottom of the sidebar: a bar to follow, a list to open, and how each one ended. */
export function TaskProgress({ collapsed }: { collapsed: boolean }) {
  const tasks = useTasksStore((state) => state.tasks)
  const recent = useTasksStore((state) => state.recent)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const [open, setOpen] = useState(false)
  const active = tasks.filter(isTaskActive)
  const now = useNowSeconds(active.length > 0)

  if (active.length === 0 && recent.length === 0) return null

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        title={active.length > 0 ? `${active.length} task${active.length > 1 ? 's' : ''} running` : recent[0] ? finishedMessage(recent[0]).title : ''}
        className="mx-auto mb-2 flex size-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--accent-primary)]"
      >
        {active.length > 0 ? <Loading theme="outline" size={15} className="animate-spin" /> : <CheckOne theme="filled" size={15} fill="currentColor" />}
      </button>
    )
  }

  return (
    <div className="mx-2 mb-2 grid gap-2.5 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3">
      {active.length > 0 && (
        <div className="grid gap-2.5">
          <ActiveTask task={active[0]} now={now} detailed={open || active.length === 1} />
          {active.length > 1 && (
            <>
              <button type="button" onClick={() => setOpen((value) => !value)} className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left text-[11.5px] text-[var(--accent-primary)]">
                {open ? <Up theme="outline" size={12} /> : <Down theme="outline" size={12} />}
                {open ? 'Hide the others' : `${active.length - 1} more`}
              </button>
              {open && active.slice(1).map((task) => <ActiveTask key={task.id} task={task} now={now} detailed />)}
            </>
          )}
        </div>
      )}
      {recent.map((task) => (
        <Finished key={task.id} task={task} />
      ))}
    </div>
  )
}
