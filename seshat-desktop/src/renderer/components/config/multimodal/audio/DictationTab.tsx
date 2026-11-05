import { useEffect, useState } from 'react'
import { CloudStorage, Computer, Server } from '@icon-park/react'
import { TextInput } from '../../knowledge/KnowledgePrimitives'
import { ActionButton, SelectField, SettingRow, SettingsCard, StatusBadge, Toggle } from '../../../settings/kit'
import { saveLocalSTT } from '../multimodalApi'
import type { LocalSTTConfig } from '../multimodalTypes'
import { AUTO_LANGUAGE, languageOptions } from '../spokenLanguages'
import type { useWhisper } from '../useWhisper'
import { AudioFieldRows } from './AudioFieldRows'
import { CLOUD_TRANSCRIPTION_FIELDS } from './audioFields'
import type { AudioDraft } from './useAudioDraft'
import { WhisperModelList } from './WhisperModelList'
import { useTranslation } from 'react-i18next'

const AUTOMATIC = 'auto'
const icon = (Glyph: typeof Computer) => <Glyph theme="outline" size={16} />

type Props = {
  whisper: ReturnType<typeof useWhisper>
  config: LocalSTTConfig | null
  draft: AudioDraft
  onSaved: (config: LocalSTTConfig) => void
  onError: (message: string | null) => void
}

/** Speech to text: the engine on this computer first, then the cloud provider as the fallback. */
export function DictationTab({ whisper, config, draft, onSaved, onError }: Props) {
  const { t } = useTranslation('config')
  const [language, setLanguage] = useState(config?.language || AUTO_LANGUAGE)
  const [address, setAddress] = useState(config?.base_url || '')
  const [addressDirty, setAddressDirty] = useState(false)

  useEffect(() => {
    if (config) {
      setLanguage(config.language || AUTO_LANGUAGE)
      setAddress(config.base_url || '')
    }
  }, [config])

  async function save(change: { language?: string; base_url?: string; enabled?: boolean }) {
    onError(null)
    try {
      onSaved(await saveLocalSTT(change))
    } catch (err) {
      onError((err as { message?: string })?.message ?? 'Failed to save the speech settings.')
    }
  }

  const running = whisper.state?.running ?? false
  const engineReady = whisper.available && whisper.state?.supported !== false
  const firstDownload = whisper.state !== null && whisper.state.downloadedModelIds.length === 0
  const cores = whisper.settings?.cores ?? 0
  const threadChoices = [AUTOMATIC, ...[2, 4, 6, 8, 12, 16].filter((count) => count <= cores).map(String)]

  return (
    <>
      <SettingsCard title={t('multimodal.audio.dictationTab.onThisComputer')} icon={icon(Computer)} badge={<StatusBadge tone={running ? 'ok' : 'muted'}>{running ? t('multimodal.audio.dictationTab.running') : t('multimodal.audio.dictationTab.off')}</StatusBadge>}>
        {engineReady ? (
          <SettingRow title={t('multimodal.audio.dictationTab.transcribeOnThisComputer')} hint={firstDownload ? t('multimodal.audio.dictationTab.theFirstTimeAbout640') : undefined}>
            <Toggle label={t('multimodal.audio.dictationTab.transcribeOnThisComputer')} enabled={running} onChange={(next) => void (next ? whisper.turnOn() : whisper.turnOff())} />
          </SettingRow>
        ) : (
          <SettingRow title={t('multimodal.audio.dictationTab.localEngine')} hint={t('multimodal.audio.dictationTab.notAvailableOnThisSystem')} />
        )}
        {whisper.busy && whisper.progress && !whisper.progress.modelId && (
          <SettingRow
            title={t('multimodal.audio.dictationTab.downloadingTheSpeechEngine')}
            hint={whisper.progress.totalBytes > 0 ? `${Math.round((whisper.progress.receivedBytes / whisper.progress.totalBytes) * 100)}%` : undefined}
          />
        )}
        <SettingRow title={t('multimodal.audio.dictationTab.spokenLanguage')}>
          <div className="w-[200px]">
            <SelectField
              compact
              value={language}
              options={languageOptions(t)}
              onChange={(next) => {
                setLanguage(next)
                void save({ language: next })
              }}
            />
          </div>
        </SettingRow>
        {engineReady && whisper.settings && (
          <SettingRow title={t('multimodal.audio.dictationTab.processorThreads')} hint={t('multimodal.audio.dictationTab.automaticUses', { used: whisper.settings.automaticThreads, cores: whisper.settings.cores })}>
            <div className="w-[200px]">
              <SelectField
                compact
                value={whisper.settings.threads === null ? AUTOMATIC : String(whisper.settings.threads)}
                options={threadChoices.map((choice) => ({ value: choice, label: choice === AUTOMATIC ? 'Automatic' : `${choice} threads` }))}
                onChange={(choice) => void whisper.setThreads(choice === AUTOMATIC ? null : Number(choice))}
              />
            </div>
          </SettingRow>
        )}
      </SettingsCard>

      {engineReady && whisper.state && whisper.models.length > 0 && (
        <SettingsCard title={t('multimodal.audio.dictationTab.models')}>
          <WhisperModelList
            models={whisper.models}
            state={whisper.state}
            progress={whisper.progress}
            busy={whisper.busy}
            onDownload={(id) => void whisper.download(id)}
            onUse={(id) => void whisper.use(id)}
            onDelete={(id) => void whisper.remove(id)}
          />
        </SettingsCard>
      )}

      <SettingsCard title={t('multimodal.audio.dictationTab.cloudTranscription')} icon={icon(CloudStorage)}>
        <AudioFieldRows fields={CLOUD_TRANSCRIPTION_FIELDS} draft={draft} />
      </SettingsCard>

      <SettingsCard title={t('multimodal.audio.dictationTab.yourOwnWhisperServer')} icon={icon(Server)}>
        <SettingRow title={t('multimodal.audio.dictationTab.serverAddress')}>
          <TextInput
            className="h-9 w-[260px]"
            value={address}
            onChange={(event) => {
              setAddress(event.target.value)
              setAddressDirty(true)
            }}
            placeholder="http://localhost:8178"
          />
          <ActionButton
            type="button"
            tone={addressDirty ? 'primary' : 'default'}
            disabled={!addressDirty}
            onClick={() => {
              void save({ base_url: address, enabled: address.trim() !== '' })
              setAddressDirty(false)
            }}
          >
            {t('multimodal.audio.dictationTab.save')}
          </ActionButton>
        </SettingRow>
      </SettingsCard>
    </>
  )
}
