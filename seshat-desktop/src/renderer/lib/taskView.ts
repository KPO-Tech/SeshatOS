import { isTaskActive, type TaskInfo, type TaskStatus } from './tasks'

/** Where a task is, in words: its step and which one it is out of how many, or that it waits for a place. */
export function stepLabel(task: TaskInfo): string {
  if (task.status === 'queued') return 'Waiting for its turn'
  if (!task.step) return 'Starting'
  return task.step_index && task.step_count ? `${task.step} (${task.step_index} of ${task.step_count})` : task.step
}

/** How far a task is, from 0 to 1. A step that has started counts for half: the programs say nothing about how far they are inside it. */
export function progressOf(task: TaskInfo): number {
  if (task.status === 'succeeded') return 1
  if (task.status === 'queued' || !task.step_index || !task.step_count) return 0.04
  return Math.min(0.96, (task.step_index - 0.5) / task.step_count)
}

/** How long a task has been going, as "42 s" or "3 min 05 s". */
export function elapsedLabel(task: Pick<TaskInfo, 'started_at' | 'ended_at'>, nowSeconds: number): string {
  const seconds = Math.max(0, Math.floor((task.ended_at ?? nowSeconds) - task.started_at))
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`
}

/** The tasks that were going the last time they were looked at and are over now. `seen` is updated to what is known now. */
export function newlyFinished(seen: Map<string, TaskStatus>, tasks: TaskInfo[]): TaskInfo[] {
  const finished: TaskInfo[] = []
  for (const task of tasks) {
    const before = seen.get(task.id)
    if (before && (before === 'queued' || before === 'running') && !isTaskActive(task)) finished.push(task)
    seen.set(task.id, task.status)
  }
  return finished
}

/** The page a task is about, so that a notification about it opens the right one. */
export function routeOfTask(task: TaskInfo): string {
  return task.kind === 'skill.install' || task.kind === 'skill.clone' ? '/skills' : '/'
}

/** What a task that ended says: shown in the sidebar and in the notification of the system. */
export function finishedMessage(task: TaskInfo): { title: string; body: string; route: string; failed: boolean } {
  const route = routeOfTask(task)
  if (task.kind === 'skill.clone') {
    if (task.status === 'succeeded') return { title: `${task.subject} is downloaded`, body: 'Check what it needs to finish the installation.', route, failed: false }
    if (task.status === 'cancelled') return { title: `The download of ${task.subject} was cancelled`, body: 'The download was stopped.', route, failed: false }
    return { title: `Downloading ${task.subject} failed`, body: (task.error || 'It did not finish.').split('\n')[0], route, failed: true }
  }
  if (task.status === 'succeeded') return { title: `${task.subject} is ready`, body: 'The installation is done.', route, failed: false }
  if (task.status === 'cancelled') return { title: `${task.subject} was cancelled`, body: 'The installation was stopped.', route, failed: false }
  const reason = (task.error || 'It did not finish.').split('\n')[0]
  return { title: `Installing ${task.subject} failed`, body: reason, route, failed: true }
}

const GIT_PHASES: Record<string, string> = {
  'Enumerating objects': 'EO',
  'Counting objects': 'CO',
  'Compressing objects': 'CMP',
  'Receiving objects': 'RO',
  'Resolving deltas': 'RD',
  'Updating files': 'UF',
  'Checking out files': 'UF'
}

const GIT_LINE = /^(Enumerating objects|Counting objects|Compressing objects|Receiving objects|Resolving deltas|Updating files|Checking out files):\s*(\d+%)(?:[^|]*?\|\s*([\d.]+ \S+\/s))?/

/**
 * The line a program printed, shortened for a narrow place: git's progress ("Receiving objects: 65% (1807/2780), 104 MiB | 2.1 MiB/s")
 * becomes "RO 65% · 2.1 MiB/s". Anything else is returned as it is, and the caller cuts it to its width.
 */
export function shortDetail(line: string): string {
  const match = GIT_LINE.exec(line.trim())
  if (!match) return line
  return [`${GIT_PHASES[match[1]]} ${match[2]}`, match[3]].filter(Boolean).join(' · ')
}
