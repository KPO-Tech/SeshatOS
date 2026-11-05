import { SettingRow, SettingsCard, StatusBadge } from '../../settings/kit'
import { confinementView } from './confinementView'
import type { SandboxMode } from './sandboxApi'
import { useTranslation } from 'react-i18next'

/**
 * Says what confines the agent's shell commands on this machine. "Not confined" is said as plainly as "confined": a
 * lock shown for commands that run with the user's full rights would mislead.
 */
export function ConfinementCard({ mode, directConfined }: { mode: SandboxMode; directConfined: boolean }) {
  const { t } = useTranslation('config')
  const view = confinementView(mode, directConfined, t)
  return (
    <SettingsCard title={t('environment.confinementCard.commandConfinement')} badge={<StatusBadge tone={view.confined ? 'ok' : 'warn'}>{view.label}</StatusBadge>}>
      <SettingRow title={view.text} />
    </SettingsCard>
  )
}
