import { useEffect, useState } from 'react'
import { CheckOne, CloseOne, Loading } from '@icon-park/react'
import { elapsedLabel, finishedMessage, progressOf, shortDetail, stepLabel } from '@renderer/lib/taskView'
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

function ActiveTask({ task, now }: { task: TaskInfo; now: number }) {
  async function stop() {
    try {
      await cancelTask(task.id)
    } finally {
      nudgeTasks()
    }
  }
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--text-primary)]" title={task.title}>
          {task.title}
        </span>
        <button
          type="button"
          onClick={() => void stop()}
          aria-label={`Cancel ${task.title}`}
          title="Cancel"
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent-danger)]"
        >
          <CloseOne theme="outline" size={13} />
        </button>
      </div>
      <Bar value={progressOf(task)} />
      <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
        <span className="min-w-0 truncate" title={stepLabel(task)}>
          {stepLabel(task)}
        </span>
        <span className="shrink-0 tabular-nums">{elapsedLabel(task, now)}</span>
      </div>
      {task.detail && (
        <div className="truncate font-mono text-[10.5px] text-[var(--text-faint)]" title={task.detail}>
          {shortDetail(task.detail)}
        </div>
      )}
    </div>
  )
}

function Finished({ task }: { task: TaskInfo }) {
  const dismiss = useTasksStore((state) => state.dismiss)
  const message = finishedMessage(task)
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className={`mt-px shrink-0 ${message.failed ? 'text-[var(--accent-danger)]' : 'text-[var(--accent-success)]'}`}>
        {message.failed ? <CloseOne theme="filled" size={14} fill="currentColor" /> : <CheckOne theme="filled" size={14} fill="currentColor" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium text-[var(--text-primary)]" title={message.title}>
          {message.title}
        </div>
        {message.failed && (
          <div className="line-clamp-2 text-[11px] text-[var(--text-muted)]" title={message.body}>
            {message.body}
          </div>
        )}
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(task.id)} className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <CloseOne theme="outline" size={13} />
      </button>
    </div>
  )
}

/** The numbers that stand for the tasks when there are several: a click shows that one. */
function Numbers({ items, selected, onSelect }: { items: TaskInfo[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1" role="tablist" aria-label="Tasks">
      {items.map((task, index) => {
        const active = isTaskActive(task)
        const failed = !active && finishedMessage(task).failed
        const chosen = task.id === selected
        return (
          <button
            key={task.id}
            type="button"
            role="tab"
            aria-selected={chosen}
            aria-label={task.title}
            title={task.title}
            onClick={() => onSelect(task.id)}
            className={[
              'flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums',
              chosen ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white' : 'border-[var(--border-soft)] bg-transparent hover:border-[var(--border-strong)]',
              !chosen && failed ? 'text-[var(--accent-danger)]' : '',
              !chosen && !failed && active ? 'text-[var(--accent-primary)]' : '',
              !chosen && !failed && !active ? 'text-[var(--text-muted)]' : ''
            ].join(' ')}
          >
            {index + 1}
          </button>
        )
      })}
    </div>
  )
}

/**
 * What the background tasks are doing, in the sidebar above the Store: one card, with a number for each task when there are several. The
 * card shows the one that was picked, and the numbers keep it short however many tasks there are.
 */
export function TaskProgress({ collapsed }: { collapsed: boolean }) {
  const tasks = useTasksStore((state) => state.tasks)
  const recent = useTasksStore((state) => state.recent)
  const dismiss = useTasksStore((state) => state.dismiss)
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const [picked, setPicked] = useState<string | null>(null)
  const active = tasks.filter(isTaskActive)
  const now = useNowSeconds(active.length > 0)
  // Oldest first, so that a number keeps standing for the same task while others come and go.
  const items = [...active, ...recent.filter((task) => !active.some((item) => item.id === task.id))].sort((a, b) => a.started_at - b.started_at)
  const shown = items.find((task) => task.id === picked) ?? items[0]

  // A task that went well says so for a moment, then leaves; one that failed stays until it is dismissed.
  useEffect(() => {
    const timers = recent.filter((task) => !finishedMessage(task).failed).map((task) => setTimeout(() => dismiss(task.id), GOOD_NEWS_MS))
    return () => timers.forEach(clearTimeout)
  }, [recent, dismiss])

  if (!shown) return null

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        title={active.length > 0 ? `${active.length} task${active.length > 1 ? 's' : ''} running` : finishedMessage(shown).title}
        className="mx-auto mb-2 flex size-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--accent-primary)]"
      >
        {active.length > 0 ? <Loading theme="outline" size={15} className="animate-spin" /> : <CheckOne theme="filled" size={15} fill="currentColor" />}
      </button>
    )
  }

  return (
    <div className="mx-2 mb-1.5 mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-2.5">
      {items.length > 1 && <Numbers items={items} selected={shown.id} onSelect={setPicked} />}
      {isTaskActive(shown) ? <ActiveTask task={shown} now={now} /> : <Finished task={shown} />}
    </div>
  )
}
