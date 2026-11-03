import { SettingRow, SettingsCard, StatusBadge } from '../../settings/kit'
import { confinementView } from './confinementView'
import type { SandboxMode } from './sandboxApi'

/**
 * Says what confines the agent's shell commands on this machine. "Not confined" is said as plainly as "confined": a
 * lock shown for commands that run with the user's full rights would mislead.
 */
export function ConfinementCard({ mode, directConfined }: { mode: SandboxMode; directConfined: boolean }) {
  const view = confinementView(mode, directConfined)
  return (
    <SettingsCard title="Command confinement" badge={<StatusBadge tone={view.confined ? 'ok' : 'warn'}>{view.label}</StatusBadge>}>
      <SettingRow title={view.text} />
    </SettingsCard>
  )
}
