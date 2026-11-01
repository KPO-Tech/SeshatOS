import { Mail, Remind, Translate, VolumeNotice } from '@icon-park/react'
import { SelectField, SettingRow, SettingsCard, SettingsPage, Toggle } from './kit'

type Props = {
  language: string
  notifications: boolean
  soundAlert: boolean
  productUpdates: boolean
  onLanguageChange: (language: string) => void
  onNotificationsChange: (enabled: boolean) => void
  onSoundAlertChange: (enabled: boolean) => void
  onProductUpdatesChange: (enabled: boolean) => void
}

const LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'Francais', label: 'Francais' }
]

const icon = (Glyph: typeof Remind) => <Glyph theme="outline" size={18} />

export function GeneralSettings({
  language,
  notifications,
  soundAlert,
  productUpdates,
  onLanguageChange,
  onNotificationsChange,
  onSoundAlertChange,
  onProductUpdatesChange
}: Props) {
  return (
    <SettingsPage id="general">
      <SettingsCard title="Language">
        <SettingRow title="Interface language" icon={icon(Translate)}>
          <div className="w-[200px]">
            <SelectField value={language} options={LANGUAGES} onChange={onLanguageChange} compact />
          </div>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Notifications">
        <SettingRow title="Desktop notifications" icon={icon(Remind)}>
          <Toggle label="Desktop notifications" enabled={notifications} onChange={onNotificationsChange} />
        </SettingRow>
        <SettingRow title="Sound alert" icon={icon(VolumeNotice)}>
          <Toggle label="Sound alert" enabled={soundAlert} onChange={onSoundAlertChange} />
        </SettingRow>
        <SettingRow title="Product updates" icon={icon(Mail)}>
          <Toggle label="Product updates" enabled={productUpdates} onChange={onProductUpdatesChange} />
        </SettingRow>
      </SettingsCard>
    </SettingsPage>
  )
}
