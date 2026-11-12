import { CheckCorrect, Remind, Translate, Up, VolumeNotice, Caution, Comment, ChartHistogram, Write } from '@icon-park/react'
import { useTranslation } from 'react-i18next'
import { useNotificationPrefs } from '@renderer/hooks/useNotificationPrefs'
import { SUPPORTED_LANGUAGES, normalizeLanguage } from '@renderer/i18n/languages'
import { useLanguage } from '@renderer/i18n/useLanguage'
import { Notice, SelectField, SettingRow, SettingsCard, SettingsPage, Toggle } from './kit'
import { useUserPreferences } from '@renderer/hooks/useUserPreferences'
import { useUIStore } from '@renderer/stores/ui'

// A language is named in itself, in every language of the interface: "Français" is never "French" to a person who reads French.
const LANGUAGES = SUPPORTED_LANGUAGES.map((entry) => ({ value: entry.code, label: entry.label }))

const icon = (Glyph: typeof Remind) => <Glyph theme="outline" size={18} />

export function LanguageNotificationsSettings() {
  const { t } = useTranslation('settings')
  const { language, setLanguage } = useLanguage()
  const { prefs, change } = useNotificationPrefs()
  const condenseTurns = useUIStore((state) => state.condenseTurns)
  const setCondenseTurns = useUIStore((state) => state.setCondenseTurns)
  // What the agent is told about answers is kept by the backend with the person's other preferences (it shapes the prompt).
  const answers = useUserPreferences()
  const saveAnswers = (patch: { rich_answers_enabled?: boolean; natural_writing_enabled?: boolean }) => {
    if (!answers.busy) void answers.save(patch)
  }
  return (
    <SettingsPage id="language-notifications">
      <SettingsCard title={t('languageNotifications.chatCard')}>
        <SettingRow title={t('languageNotifications.condenseTurns')} hint={t('languageNotifications.condenseTurnsHint')} icon={icon(Comment)}>
          <Toggle label={t('languageNotifications.condenseTurns')} enabled={condenseTurns} onChange={setCondenseTurns} />
        </SettingRow>
        <SettingRow title={t('languageNotifications.richAnswers')} hint={t('languageNotifications.richAnswersHint')} icon={icon(ChartHistogram as typeof Remind)}>
          <Toggle
            label={t('languageNotifications.richAnswers')}
            enabled={answers.prefs?.rich_answers_enabled !== false}
            onChange={(enabled) => saveAnswers({ rich_answers_enabled: enabled })}
          />
        </SettingRow>
        <SettingRow title={t('languageNotifications.naturalWriting')} hint={t('languageNotifications.naturalWritingHint')} icon={icon(Write as typeof Remind)}>
          <Toggle
            label={t('languageNotifications.naturalWriting')}
            enabled={answers.prefs?.natural_writing_enabled === true}
            onChange={(enabled) => saveAnswers({ natural_writing_enabled: enabled })}
          />
        </SettingRow>
      </SettingsCard>
      {answers.error && <Notice tone="error">{answers.error}</Notice>}

      <SettingsCard title={t('languageNotifications.languageCard')}>
        <SettingRow title={t('languageNotifications.interfaceLanguage')} icon={icon(Translate)}>
          <div className="w-[200px]">
            <SelectField value={language} options={LANGUAGES} onChange={(value) => { const next = normalizeLanguage(value); if (next) void setLanguage(next) }} compact />
          </div>
        </SettingRow>
      </SettingsCard>

      <SettingsCard title={t('languageNotifications.notificationsCard')}>
        <SettingRow title={t('languageNotifications.desktop')} hint={t('languageNotifications.desktopHint')} icon={icon(Remind)}>
          <Toggle label={t('languageNotifications.desktop')} enabled={prefs.desktop} onChange={(value) => change('desktop', value)} />
        </SettingRow>
        <SettingRow title={t('languageNotifications.sound')} icon={icon(VolumeNotice)}>
          <Toggle label={t('languageNotifications.sound')} enabled={prefs.sound} onChange={(value) => change('sound', value)} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title={t('languageNotifications.toldAboutCard')}>
        <SettingRow title={t('languageNotifications.tasks')} icon={icon(CheckCorrect as typeof Remind)}>
          <Toggle label={t('languageNotifications.tasks')} enabled={prefs.tasks} onChange={(value) => change('tasks', value)} />
        </SettingRow>
        <SettingRow title={t('languageNotifications.agentReplies')} icon={icon(Remind)} hint={t('languageNotifications.agentRepliesHint')}>
          <Toggle label={t('languageNotifications.agentReplies')} enabled={prefs.agents} onChange={(value) => change('agents', value)} />
        </SettingRow>
        <SettingRow title={t('languageNotifications.errors')} icon={icon(Caution as typeof Remind)}>
          <Toggle label={t('languageNotifications.errors')} enabled={prefs.errors} onChange={(value) => change('errors', value)} />
        </SettingRow>
        <SettingRow title={t('languageNotifications.appUpdates')} icon={icon(Up as typeof Remind)}>
          <Toggle label={t('languageNotifications.appUpdates')} enabled={prefs.updates} onChange={(value) => change('updates', value)} />
        </SettingRow>
      </SettingsCard>
    </SettingsPage>
  )
}
