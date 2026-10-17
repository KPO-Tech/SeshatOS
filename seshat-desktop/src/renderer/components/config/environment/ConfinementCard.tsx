import { useCallback, useEffect, useState } from 'react'
import { ConfigCard, SoftButton, StatusPill } from '../knowledge/KnowledgePrimitives'
import { confinementView } from './confinementView'

/**
 * Says what confines the agent's shell commands on this machine, and on Windows offers the one-time setup.
 * "Not confined" is said as plainly as "confined": a lock shown for commands that run with the user's full rights
 * would mislead.
 */
export function ConfinementCard({ docker }: { docker: boolean }) {
  const [status, setStatus] = useState<SrtStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await (window.nexus?.sandbox?.srtStatus() ?? Promise.resolve(null)).catch(() => null))
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function enable() {
    setBusy(true)
    try {
      setStatus(await (window.nexus?.sandbox?.srtEnable() ?? Promise.resolve(null)))
    } finally {
      setBusy(false)
    }
  }

  const view = confinementView(status, docker)
  return (
    <ConfigCard
      title="Command confinement"
      description="What limits the agent's shell commands to your project folder and a short list of network hosts."
      status={<StatusPill tone={view.confined ? 'ok' : 'warn'}>{view.label}</StatusPill>}
      action={view.canEnable
        ? <SoftButton tone="primary" onClick={() => void enable()} disabled={busy}>{busy ? 'Waiting for Windows...' : 'Enable confinement'}</SoftButton>
        : undefined}
    >
      <div className="grid gap-2 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
        <div>{view.text}</div>
        {status?.detail && !view.confined && <div className="font-mono text-[11px]">{status.detail}</div>}
      </div>
    </ConfigCard>
  )
}
