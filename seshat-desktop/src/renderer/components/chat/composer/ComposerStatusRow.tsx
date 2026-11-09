import { useSessionStore } from '@renderer/stores/session'
import { gitFolder } from '@renderer/lib/gitFolder'
import { BranchLabel } from './BranchLabel'
import { CondenseTurnsToggle } from './CondenseTurnsToggle'
import { ContextGauge } from './ContextGauge'

/** The line under the composer: the git branch on the left, how full the context is on the right. */
export function ComposerStatusRow({ sessionId, projectPath }: { sessionId: string; projectPath?: string }) {
  const session = useSessionStore((s) => s.sessions.find((item) => item.id === sessionId))
  const folder = gitFolder({ projectPath: projectPath || session?.projectPath, workspacePath: session?.workspacePath })

  return (
    <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-2">
      <div className="flex min-w-0 items-center gap-3">
        <BranchLabel folder={folder} />
        <CondenseTurnsToggle />
      </div>
      <ContextGauge sessionId={sessionId} />
    </div>
  )
}
