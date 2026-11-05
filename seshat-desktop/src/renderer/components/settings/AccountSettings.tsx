import { Copy, Logout, Mail } from '@icon-park/react'
import { useTranslation } from 'react-i18next'
import type { User } from '@renderer/api/types'
import { useSettingsMenu } from '@renderer/hooks/useSettingsMenu'
import { ActionButton, Chip, SettingRow, SettingsCard, SettingsPage, StatusBadge } from './kit'
import { Avatar, formatStatus, initialsFor } from './SettingsPrimitives'
import { TokenActivityCard } from './TokenActivityCard'

type Props = {
  user: User
  displayName: string
  onLogout: () => void
}

export function AccountSettings({ user, displayName, onLogout }: Props) {
  const { t } = useTranslation('settings')
  // Only an account paired with SeshatCloud can be signed out of: the local workspace has nothing to leave.
  const { connected } = useSettingsMenu()
  return (
    <SettingsPage
      id="account"
      badge={connected ? <StatusBadge tone="ok">{t('account.connected')}</StatusBadge> : <StatusBadge tone="muted">{t('account.local')}</StatusBadge>}
      actions={
        <ActionButton onClick={onLogout} disabled={!connected} title={connected ? undefined : t('account.notSignedIn')}>
          <Logout theme="outline" size={15} />
          {t('account.signOut')}
        </ActionButton>
      }
    >
      <SettingsCard padded>
        <div className="flex items-center gap-4">
          <Avatar initials={initialsFor(displayName)} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-[16px] font-semibold text-[var(--text-primary)]">{displayName}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <Chip tone="ok">{formatStatus(user.status, t)}</Chip>
              <Chip tone="ok">{t('account.sessionReady')}</Chip>
            </div>
          </div>
        </div>
      </SettingsCard>

      <TokenActivityCard />

      <SettingsCard title={t('account.details')}>
        <SettingRow title={t('account.email')} icon={<Mail theme="outline" size={18} />}>
          <span className="max-w-[360px] truncate text-[13px] text-[var(--text-secondary)]">{user.email}</span>
        </SettingRow>
        <SettingRow title={t('account.userId')} icon={<Copy theme="outline" size={18} />}>
          <span className="max-w-[300px] truncate font-mono text-[12px] text-[var(--text-secondary)]">{user.id}</span>
          <ActionButton onClick={() => void navigator.clipboard?.writeText(user.id)}>{t('account.copy')}</ActionButton>
        </SettingRow>
      </SettingsCard>
    </SettingsPage>
  )
}
