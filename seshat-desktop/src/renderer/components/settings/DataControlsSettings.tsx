import { useState } from 'react'
import { useUIStore } from '@renderer/stores/ui'
import { ActionButton, SettingRow, SettingsCard, SettingsPage, StatusBadge } from './kit'

const UNAVAILABLE = ['Clear application cache', 'Delete all conversations', 'Clear connector accounts']

export function DataControlsSettings() {
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
        <SettingRow title="Remembered tool approvals" hint={approvalCount > 0 ? `${approvalCount} remembered: you are not asked again for these.` : 'None remembered.'}>
          <ActionButton type="button" onClick={handleClearApprovals} disabled={approvalCount === 0}>
            {justCleared ? 'Cleared' : 'Clear all'}
          </ActionButton>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Coming later">
        {UNAVAILABLE.map((title) => (
          <SettingRow key={title} title={title}>
            <StatusBadge tone="muted">Not available</StatusBadge>
          </SettingRow>
        ))}
      </SettingsCard>
    </SettingsPage>
  )
}
