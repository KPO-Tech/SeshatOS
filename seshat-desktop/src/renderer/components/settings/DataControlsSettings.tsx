import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@renderer/stores/ui'
import { ActionButton, SettingRow, SettingsCard, SettingsPage, StatusBadge } from './kit'

const UNAVAILABLE = ['settings:dataControls.clearCache', 'settings:dataControls.deleteConversations', 'settings:dataControls.clearConnectors']

export function DataControlsSettings() {
  const { t } = useTranslation('settings')
  const approvalCount = useUIStore((s) => Object.keys(s.rememberedApprovals).length)
  const clearAllApprovals = useUIStore((s) => s.clearAllApprovals)
  const [justCleared, setJustCleared] = useState(false)

  function handleClearApprovals() {
    clearAllApprovals()
    setJustCleared(true)
    setTimeout(() => setJustCleared(false), 2000)
  }

  return (
    <SettingsPage id="data-controls">
      <SettingsCard>
        <SettingRow title={t('dataControls.approvals')} hint={approvalCount > 0 ? t('dataControls.approvalsHint', { count: approvalCount }) : t('dataControls.approvalsNone')}>
          <ActionButton type="button" onClick={handleClearApprovals} disabled={approvalCount === 0}>
            {justCleared ? t('dataControls.cleared') : t('dataControls.clearAll')}
          </ActionButton>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title={t('dataControls.comingLater')}>
        {UNAVAILABLE.map((title) => (
          <SettingRow key={title} title={t(title)}>
            <StatusBadge tone="muted">{t('dataControls.notAvailable')}</StatusBadge>
          </SettingRow>
        ))}
      </SettingsCard>
    </SettingsPage>
  )
}
