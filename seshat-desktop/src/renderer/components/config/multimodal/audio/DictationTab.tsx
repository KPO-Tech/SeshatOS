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
      <SettingsCard title="On this computer" icon={icon(Computer)} badge={<StatusBadge tone={running ? 'ok' : 'muted'}>{running ? 'Running' : 'Off'}</StatusBadge>}>
        {engineReady ? (
          <SettingRow title="Transcribe on this computer" hint={firstDownload ? 'The first time, about 640 MB is downloaded.' : undefined}>
            <Toggle label="Transcribe on this computer" enabled={running} onChange={(next) => void (next ? whisper.turnOn() : whisper.turnOff())} />
          </SettingRow>
        ) : (
          <SettingRow title="Local engine" hint="Not available on this system. Use a provider or your own server." />
        )}
        {whisper.busy && whisper.progress && !whisper.progress.modelId && (
          <SettingRow
            title="Downloading the speech engine"
            hint={whisper.progress.totalBytes > 0 ? `${Math.round((whisper.progress.receivedBytes / whisper.progress.totalBytes) * 100)}%` : undefined}
          />
        )}
        <SettingRow title="Spoken language">
          <div className="w-[200px]">
            <SelectField
              compact
              value={language}
              options={languageOptions()}
              onChange={(next) => {
                setLanguage(next)
                void save({ language: next })
              }}
            />
          </div>
        </SettingRow>
        {engineReady && whisper.settings && (
          <SettingRow title="Processor threads" hint={`Automatic uses ${whisper.settings.automaticThreads} of ${whisper.settings.cores}.`}>
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
        <SettingsCard title="Models">
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

      <SettingsCard title="Cloud transcription" icon={icon(CloudStorage)}>
        <AudioFieldRows fields={CLOUD_TRANSCRIPTION_FIELDS} draft={draft} />
      </SettingsCard>

      <SettingsCard title="Your own Whisper server" icon={icon(Server)}>
        <SettingRow title="Server address">
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
            Save
          </ActionButton>
        </SettingRow>
      </SettingsCard>
    </>
  )
}
