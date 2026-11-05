import { useUserPreferences } from '@renderer/hooks/useUserPreferences'
import { Notice, SettingRow, SettingsCard, SettingsPage, Toggle } from '../../settings/kit'
import { useTranslation } from 'react-i18next'

/** Whether the agent may draw tables, figures and steps in its answers. */
export function AnswersConfig() {
  const { t } = useTranslation('config')
  const { prefs, busy, error, save } = useUserPreferences()

  return (
    <SettingsPage id="answers">
      {error && <Notice tone="error">{error}</Notice>}
      <SettingsCard>
        <SettingRow title={t('answers.answersConfig.richAnswers')} hint={t('answers.answersConfig.tablesFiguresAndStepsDrawn')}>
          <Toggle
            label={t('answers.answersConfig.richAnswers')}
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
