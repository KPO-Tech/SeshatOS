import { useUserPreferences } from '@renderer/hooks/useUserPreferences'
import { Notice, SettingRow, SettingsCard, SettingsPage, Toggle } from '../../settings/kit'

/** Whether the agent may draw tables, figures and steps in its answers. */
export function AnswersConfig() {
  const { prefs, busy, error, save } = useUserPreferences()

  return (
    <SettingsPage id="answers">
      {error && <Notice tone="error">{error}</Notice>}
      <SettingsCard>
        <SettingRow title="Rich answers" hint="Tables, figures and steps drawn as components. From the next message.">
          <Toggle
            label="Rich answers"
            enabled={prefs?.rich_answers_enabled !== false}
            onChange={(enabled) => {
              if (!busy) void save({ rich_answers_enabled: enabled })
            }}
          />
        </SettingRow>
      </SettingsCard>
    </SettingsPage>
  )
}
