import { create } from 'zustand'
import { newlyFinished } from '@renderer/lib/taskView'
import { fetchTasks, type TaskInfo, type TaskStatus } from '@renderer/lib/tasks'

// The long jobs of the backend, as the sidebar and the pages show them. The state lives here, not in a page, so that leaving a page loses
// nothing (see docs/decisions/0012).

/** How many of the tasks that just ended stay in the sidebar. */
const RECENT_KEPT = 4

type TasksState = {
  tasks: TaskInfo[]
  /** The tasks that ended since the person last looked, newest first: the sidebar says how they went until they are dismissed. */
  recent: TaskInfo[]
  /** Reads the tasks again; returns the ones that ended since the last time. */
  refresh: () => Promise<TaskInfo[]>
  dismiss: (id: string) => void
}

const seen = new Map<string, TaskStatus>()

export const useTasksStore = create<TasksState>()((set, get) => ({
  tasks: [],
  recent: [],
  refresh: async () => {
    const { tasks } = await fetchTasks()
    const finished = newlyFinished(seen, tasks)
    set({ tasks, recent: [...finished, ...get().recent.filter((task) => !finished.some((item) => item.id === task.id))].slice(0, RECENT_KEPT) })
    return finished
  },
  dismiss: (id) => set((state) => ({ recent: state.recent.filter((task) => task.id !== id) }))
}))

/** Asks for the tasks to be read now: after something that starts one. */
export function nudgeTasks() {
  window.dispatchEvent(new Event('seshat-tasks-changed'))
}
