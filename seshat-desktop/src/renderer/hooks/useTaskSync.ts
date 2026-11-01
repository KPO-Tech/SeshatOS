import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { finishedMessage } from '@renderer/lib/taskView'
import { isTaskActive, type TaskInfo } from '@renderer/lib/tasks'
import { notify } from '@renderer/stores/notifications'
import { useTasksStore } from '@renderer/stores/tasks'

/** How often the backend is asked while a task runs, and while nothing does (to see a task that something else started). */
const BUSY_MS = 1500
const IDLE_MS = 12_000

export const TASK_FINISHED_EVENT = 'seshat-task-finished'

function announce(task: TaskInfo) {
  // The pages that show what the task made (the list of skills) read it again.
  window.dispatchEvent(new CustomEvent<TaskInfo>(TASK_FINISHED_EVENT, { detail: task }))
  // The sidebar says how it went. The bell keeps it, and when the person is elsewhere (another window, or the app hidden in the tray) the
  // system says it too, as their choices in Settings > General allow.
  // A download that went well is followed by the window of what the skills need (see SkillReviewHost), which says the rest.
  if (task.kind === 'skill.clone' && task.status === 'succeeded') return
  const { title, body, route, failed } = finishedMessage(task)
  notify(failed ? 'error' : 'task', { title, body, route })
}

/**
 * Keeps the store of tasks up to date: often while one runs, rarely otherwise. It tells the main process how many are running, so that
 * closing the window while work is in progress hides it instead of stopping the work, and opens the page a notification points to.
 */
export function useTaskSync() {
  const navigate = useNavigate()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let reported = -1

    async function tick() {
      try {
        const finished = await useTasksStore.getState().refresh()
        finished.forEach(announce)
      } catch {
        // The backend is not answering: the next look tries again.
      }
      if (stopped) return
      const active = useTasksStore.getState().tasks.filter(isTaskActive).length
      if (active !== reported) {
        reported = active
        void window.seshat?.background?.setBusy(active)
      }
      timer = setTimeout(() => void tick(), active > 0 ? BUSY_MS : IDLE_MS)
    }

    function nudge() {
      if (timer) clearTimeout(timer)
      void tick()
    }

    void tick()
    window.addEventListener('seshat-tasks-changed', nudge)
    window.addEventListener('focus', nudge)
    const stopOpen = window.seshat?.notify?.onOpen((route) => navigate(route))
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('seshat-tasks-changed', nudge)
      window.removeEventListener('focus', nudge)
      stopOpen?.()
    }
  }, [navigate])
}
