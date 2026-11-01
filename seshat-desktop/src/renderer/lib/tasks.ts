import { api } from '@renderer/api/client'

// The long jobs of the app run in the backend (see docs/decisions/0012): this is how the desktop reads them.

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'

export type TaskInfo = {
  id: string
  kind: string
  subject: string
  title: string
  status: TaskStatus
  step?: string
  step_index?: number
  step_count?: number
  detail?: string
  error?: string
  log?: string[]
  started_at: number
  ended_at?: number
}

export const isTaskActive = (task: Pick<TaskInfo, 'status'>) => task.status === 'queued' || task.status === 'running'

/** The reason a task that did not succeed gives, in words the person can read. */
export function taskFailure(task: TaskInfo): string {
  if (task.status === 'cancelled') return task.kind === 'skill.clone' ? 'The download was cancelled.' : 'The installation was cancelled.'
  if (task.status === 'interrupted') return task.error || 'The app was closed before this finished.'
  return task.error || 'The task failed.'
}

export async function fetchTasks() {
  const result = await api.get<{ tasks: TaskInfo[]; active: number }>('/tasks')
  return { tasks: result.tasks ?? [], active: result.active ?? 0 }
}

export function fetchTask(id: string) {
  return api.get<TaskInfo>(`/tasks/${encodeURIComponent(id)}`)
}

export function cancelTask(id: string) {
  return api.post<TaskInfo>(`/tasks/${encodeURIComponent(id)}/cancel`, {})
}

export function forgetTask(id: string) {
  return api.delete(`/tasks/${encodeURIComponent(id)}`)
}

const POLL_MS = 1500

/**
 * Follows a task until it is over: resolves with it when it succeeded, and rejects with the reason when it did not. The answer of each
 * poll is short, so a job that lasts for many minutes is no longer one request that can time out.
 */
export async function waitForTask(id: string, onUpdate?: (task: TaskInfo) => void): Promise<TaskInfo> {
  for (;;) {
    const task = await fetchTask(id)
    onUpdate?.(task)
    if (!isTaskActive(task)) {
      if (task.status === 'succeeded') return task
      throw new Error(taskFailure(task))
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
