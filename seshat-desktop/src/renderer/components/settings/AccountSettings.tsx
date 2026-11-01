import { Copy, Logout, Mail } from '@icon-park/react'
import type { User } from '@renderer/api/types'
import { useSettingsMenu } from '@renderer/hooks/useSettingsMenu'
import { ActionButton, Chip, SettingRow, SettingsCard, SettingsPage, StatusBadge } from './kit'
import { Avatar, formatStatus, initialsFor } from './SettingsPrimitives'

type Props = {
  user: User
  displayName: string
  onLogout: () => void
}

export function AccountSettings({ user, displayName, onLogout }: Props) {
  // Only an account paired with SeshatCloud can be signed out of: the local workspace has nothing to leave.
  const { connected } = useSettingsMenu()
  return (
    <SettingsPage
      id="account"
      badge={connected ? <StatusBadge tone="ok">Connected</StatusBadge> : <StatusBadge tone="muted">Local</StatusBadge>}
      actions={
        <ActionButton onClick={onLogout} disabled={!connected} title={connected ? undefined : 'You are not signed in: this workspace is local'}>
          <Logout theme="outline" size={15} />
          Sign out
        </ActionButton>
      }
    >
      <SettingsCard padded>
        <div className="flex items-center gap-4">
          <Avatar initials={initialsFor(displayName)} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-[16px] font-semibold text-[var(--text-primary)]">{displayName}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <Chip tone="ok">{formatStatus(user.status)}</Chip>
              <Chip tone="ok">Session storage ready</Chip>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Details">
        <SettingRow title="Email" icon={<Mail theme="outline" size={18} />}>
          <span className="max-w-[360px] truncate text-[13px] text-[var(--text-secondary)]">{user.email}</span>
        </SettingRow>
        <SettingRow title="User ID" icon={<Copy theme="outline" size={18} />}>
          <span className="max-w-[300px] truncate font-mono text-[12px] text-[var(--text-secondary)]">{user.id}</span>
          <ActionButton onClick={() => void navigator.clipboard?.writeText(user.id)}>Copy</ActionButton>
        </SettingRow>
      </SettingsCard>
    </SettingsPage>
  )
}
