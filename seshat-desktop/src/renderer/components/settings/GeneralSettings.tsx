import { CheckCorrect, Remind, Translate, Up, VolumeNotice, Caution } from '@icon-park/react'
import { useNotificationPrefs } from '@renderer/hooks/useNotificationPrefs'
import { SelectField, SettingRow, SettingsCard, SettingsPage, Toggle } from './kit'

type Props = {
  language: string
  onLanguageChange: (language: string) => void
}

const LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'Francais', label: 'Francais' }
]

const icon = (Glyph: typeof Remind) => <Glyph theme="outline" size={18} />

export function GeneralSettings({ language, onLanguageChange }: Props) {
  const { prefs, change } = useNotificationPrefs()
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
        <SettingRow title="Desktop notifications" hint="Shown only when SeshatOS is not the window in front." icon={icon(Remind)}>
          <Toggle label="Desktop notifications" enabled={prefs.desktop} onChange={(value) => change('desktop', value)} />
        </SettingRow>
        <SettingRow title="Sound" icon={icon(VolumeNotice)}>
          <Toggle label="Sound" enabled={prefs.sound} onChange={(value) => change('sound', value)} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="What to be told about">
        <SettingRow title="Tasks" icon={icon(CheckCorrect as typeof Remind)}>
          <Toggle label="Tasks" enabled={prefs.tasks} onChange={(value) => change('tasks', value)} />
        </SettingRow>
        <SettingRow title="Errors" icon={icon(Caution as typeof Remind)}>
          <Toggle label="Errors" enabled={prefs.errors} onChange={(value) => change('errors', value)} />
        </SettingRow>
        <SettingRow title="App updates" icon={icon(Up as typeof Remind)}>
          <Toggle label="App updates" enabled={prefs.updates} onChange={(value) => change('updates', value)} />
        </SettingRow>
      </SettingsCard>
    </SettingsPage>
  )
}
