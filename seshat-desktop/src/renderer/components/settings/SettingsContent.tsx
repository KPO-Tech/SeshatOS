import type { User } from '@renderer/api/types'
import type { ThemePreference } from '@renderer/lib/theme'
import { AboutSettings } from './AboutSettings'
import { AccountSettings } from './AccountSettings'
import { DataControlsSettings } from './DataControlsSettings'
import { GeneralSettings } from './GeneralSettings'
import { MemoriesSettings } from './MemoriesSettings'
import type { SettingsSection } from './SettingsModal'
import { ShortcutsSettings } from './ShortcutsSettings'

type Props = {
  section: SettingsSection
  user: User
  displayName: string
  theme: ThemePreference
  language: string
  notifications: boolean
  soundAlert: boolean
  productUpdates: boolean
  onLogout: () => void
  onThemeChange: (theme: ThemePreference) => void
  onLanguageChange: (language: string) => void
  onNotificationsChange: (enabled: boolean) => void
  onSoundAlertChange: (enabled: boolean) => void
  onProductUpdatesChange: (enabled: boolean) => void
}

export function SettingsContent({
  section,
  user,
  displayName,
  theme,
  language,
  notifications,
  soundAlert,
  productUpdates,
  onLogout,
  onThemeChange,
  onLanguageChange,
  onNotificationsChange,
  onSoundAlertChange,
  onProductUpdatesChange
}: Props) {
  if (section === 'account') {
    return <AccountSettings user={user} displayName={displayName} onLogout={onLogout} />
  }

  if (section === 'shortcuts') return <ShortcutsSettings />
  if (section === 'memories') return <MemoriesSettings />
  if (section === 'data-controls') return <DataControlsSettings />
  if (section === 'about') return <AboutSettings />

  return (
    <GeneralSettings
      theme={theme}
      language={language}
      notifications={notifications}
      soundAlert={soundAlert}
      productUpdates={productUpdates}
      onThemeChange={onThemeChange}
      onLanguageChange={onLanguageChange}
      onNotificationsChange={onNotificationsChange}
      onSoundAlertChange={onSoundAlertChange}
      onProductUpdatesChange={onProductUpdatesChange}
    />
  )
}
