import { useCallback, useEffect, useState } from 'react'
import { ConfigCard, StatusPill } from '../knowledge/KnowledgePrimitives'
import { confinementView } from './confinementView'

/**
 * Says what confines the agent's shell commands on this machine. On Windows the sandbox is alpha and is not set up
 * for the user: the card gives the command to run.
 * "Not confined" is said as plainly as "confined": a lock shown for commands that run with the user's full rights
 * would mislead.
 */
export function ConfinementCard({ docker }: { docker: boolean }) {
  const [status, setStatus] = useState<SrtStatus | null>(null)

  const refresh = useCallback(async () => {
    setStatus(await (window.nexus?.sandbox?.srtStatus() ?? Promise.resolve(null)).catch(() => null))
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const view = confinementView(status, docker)
  return (
    <ConfigCard
      title="Command confinement"
      description="What limits the agent's shell commands to your project folder and a short list of network hosts."
      status={<StatusPill tone={view.confined ? 'ok' : 'warn'}>{view.label}</StatusPill>}
    >
      <div className="grid gap-2 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
        <div>{view.text}</div>
        {status?.detail && !view.confined && <div className="font-mono text-[11px]">{status.detail}</div>}
      </div>
    </ConfigCard>
  )
}
