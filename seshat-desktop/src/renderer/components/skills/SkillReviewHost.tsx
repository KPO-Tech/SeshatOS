import { useEffect, useState } from 'react'
import { TASK_FINISHED_EVENT } from '@renderer/hooks/useTaskSync'
import type { TaskInfo } from '@renderer/lib/tasks'
import { nudgeTasks } from '@renderer/stores/tasks'
import { SkillInstallDialog } from './SkillInstallDialog'
import { fetchSkillPlan, startSkillEnvironment, uninstallSkillRepo } from './skillsApi'
import type { InstallPlan } from './skillsTypes'

/** The pages that list skills read them again when this is sent: a repository was removed, or changed. */
export const SKILLS_CHANGED_EVENT = 'seshat-skills-changed'

/**
 * Opens the window that shows what a downloaded repository needs, wherever the person is when the download ends: the download goes on in the
 * background, so they may well be in a conversation by then. Nothing is installed until they agree.
 */
export function SkillReviewHost() {
  const [reviewing, setReviewing] = useState<{ name: string; plan: InstallPlan } | null>(null)

  useEffect(() => {
    async function onFinished(event: Event) {
      const task = (event as CustomEvent<TaskInfo>).detail
      if (task.kind !== 'skill.clone' || task.status !== 'succeeded') return
      try {
        const result = await fetchSkillPlan(task.subject)
        if (result.needs_environment) setReviewing({ name: result.name, plan: result.plan })
      } catch {
        // The repository was removed in the meantime: there is nothing to review.
      }
    }
    const listener = (event: Event) => void onFinished(event)
    window.addEventListener(TASK_FINISHED_EVENT, listener)
    return () => window.removeEventListener(TASK_FINISHED_EVENT, listener)
  }, [])

  async function confirm(name: string) {
    await startSkillEnvironment(name)
    setReviewing(null)
    nudgeTasks()
  }

  async function cancel(name: string) {
    setReviewing(null)
    try {
      await uninstallSkillRepo(name)
    } catch {
      // The repository stays marked as unfinished, and is replaced the next time it is installed.
    }
    window.dispatchEvent(new Event(SKILLS_CHANGED_EVENT))
  }

  if (!reviewing) return null
  return <SkillInstallDialog name={reviewing.name} plan={reviewing.plan} onConfirm={() => confirm(reviewing.name)} onCancel={() => void cancel(reviewing.name)} />
}
