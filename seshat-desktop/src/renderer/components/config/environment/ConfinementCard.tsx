import { useCallback, useEffect, useState } from 'react'
import { ActionButton, SettingRow, SettingsCard, StatusBadge } from '../../settings/kit'
import { confinementView } from './confinementView'

/**
 * Says what confines the agent's shell commands on this machine. On Windows the sandbox is alpha and is not set up
 * for the user: the card gives the command to run.
 * "Not confined" is said as plainly as "confined": a lock shown for commands that run with the user's full rights
 * would mislead.
 */
export function ConfinementCard({ docker }: { docker: boolean }) {
  const [status, setStatus] = useState<SrtStatus | null>(null)

  // Opening the card checks once; the answer is kept for the run, so coming back here does not start another command.
  const refresh = useCallback(async (again = false) => {
    setStatus(await (window.seshat?.sandbox?.srtStatus({ refresh: again }) ?? Promise.resolve(null)).catch(() => null))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const view = confinementView(status, docker)
  return (
    <SettingsCard title="Command confinement" badge={<StatusBadge tone={view.confined ? 'ok' : 'warn'}>{view.label}</StatusBadge>}>
      <SettingRow title={view.text}>
        {!view.confined && !docker && (
          <ActionButton type="button" onClick={() => void refresh(true)}>
            Check again
          </ActionButton>
        )}
      </SettingRow>
      {status?.detail && !view.confined && <div className="px-4 py-3 font-mono text-[11px] text-[var(--text-muted)]">{status.detail}</div>}
    </SettingsCard>
  )
}
