import { useEffect, useState, type ReactNode } from 'react'
import { ConfigCard, CustomSelect, Field, SoftButton, StatusPill, TextInput, ToggleSwitch } from '../knowledge/KnowledgePrimitives'
import { saveLocalSTT } from './multimodalApi'
import { CapabilityIcon } from './MultimodalIcons'
import type { LocalSTTConfig } from './multimodalTypes'
import { AUTO_LANGUAGE, languageOptions } from './spokenLanguages'
import { useWhisper } from './useWhisper'
import { WhisperModels } from './WhisperModels'

const AUTOMATIC = 'auto'

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="mt-0.5 text-[12px] leading-4 text-[var(--text-muted)]">{hint}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function LocalSpeechCard({ config, configured, onSaved }: { config: LocalSTTConfig | null; configured?: boolean; onSaved: (config: LocalSTTConfig) => void }) {
  const whisper = useWhisper()
  const [language, setLanguage] = useState(config?.language || AUTO_LANGUAGE)
  const [address, setAddress] = useState(config?.base_url || '')
  const [addressDirty, setAddressDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (config) {
      setLanguage(config.language || AUTO_LANGUAGE)
      setAddress(config.base_url || '')
    }
  }, [config])

  async function save(change: { language?: string; base_url?: string; enabled?: boolean }) {
    setError(null)
    try {
      onSaved(await saveLocalSTT(change))
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to save the speech settings.')
    }
  }

  function chooseLanguage(next: string) {
    setLanguage(next)
    void save({ language: next })
  }

  const running = whisper.state?.running ?? false
  const on = running || Boolean(configured) || Boolean(config?.enabled)
  const cores = whisper.settings?.cores ?? 0
  const threadChoices = [AUTOMATIC, ...[2, 4, 6, 8, 12, 16].filter((count) => count <= cores).map(String)]

  return (
    <ConfigCard
      title="On this computer"
      description="Dictation and the agent's transcription run here first, with no account and no cost. The cloud provider is the fallback."
      status={<StatusPill tone={on ? 'ok' : 'muted'}>{running ? 'Running' : on ? 'Enabled' : 'Off'}</StatusPill>}
      action={<CapabilityIcon name="whisper" />}
    >
      <div className="grid gap-4">
        <Row title="Spoken language" hint="Naming one language makes transcription about twice as fast. Detection works for any language.">
          <div className="w-52">
            <CustomSelect value={language} options={languageOptions()} onChange={chooseLanguage} compact />
          </div>
        </Row>

        {whisper.available && whisper.state?.supported !== false && (
          <>
            <Row
              title="Transcribe on this computer"
              hint={
                whisper.state && whisper.state.downloadedModelIds.length === 0
                  ? 'The first time, the speech engine and two models are downloaded (about 640 MB).'
                  : 'Uses the model chosen below; nothing leaves the computer.'
              }
            >
              <ToggleSwitch enabled={running} onChange={(next) => void (next ? whisper.turnOn() : whisper.turnOff())} />
            </Row>

            {whisper.busy && whisper.progress && !whisper.progress.modelId && (
              <div className="text-[12px] text-[var(--text-muted)]">
                Downloading the speech engine...
                {whisper.progress.totalBytes > 0 ? ` ${Math.round((whisper.progress.receivedBytes / whisper.progress.totalBytes) * 100)}%` : ''}
              </div>
            )}

            {whisper.state && whisper.models.length > 0 && (
              <Field label="Models">
                <WhisperModels
                  models={whisper.models}
                  state={whisper.state}
                  progress={whisper.progress}
                  busy={whisper.busy}
                  onDownload={(id) => void whisper.download(id)}
                  onUse={(id) => void whisper.use(id)}
                  onDelete={(id) => void whisper.remove(id)}
                />
                <div className="mt-1.5 text-[12px] leading-4 text-[var(--text-muted)]">
                  Base answers in about 4 seconds for a 7 second clip on a laptop processor; Small is more accurate and about three times slower. Both were measured on one machine, yours may differ.
                </div>
              </Field>
            )}

            {whisper.settings && (
              <Row
                title="Processor threads"
                hint={`Automatic uses ${whisper.settings.automaticThreads} of the ${whisper.settings.cores} threads of this computer. More threads are faster but slow down the rest of the machine.`}
              >
                <div className="w-36">
                  <CustomSelect
                    value={whisper.settings.threads === null ? AUTOMATIC : String(whisper.settings.threads)}
                    options={threadChoices.map((choice) => ({ value: choice, label: choice === AUTOMATIC ? 'Automatic' : `${choice} threads` }))}
                    onChange={(choice) => void whisper.setThreads(choice === AUTOMATIC ? null : Number(choice))}
                    compact
                  />
                </div>
              </Row>
            )}
          </>
        )}

        {whisper.state?.supported === false && (
          <div className="rounded-md border border-dashed border-[var(--border-soft)] px-3 py-2.5 text-[12px] leading-4 text-[var(--text-muted)]">
            The local speech engine is not available on this system yet. Use a speech-to-text provider below, or point the app at a Whisper compatible server.
          </div>
        )}

        <details className="rounded-md border border-[var(--border-soft)] px-3 py-2.5">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--text-secondary)]">Use my own Whisper compatible server</summary>
          <div className="mt-3 grid gap-3">
            <Field label="Server address">
              <TextInput
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value)
                  setAddressDirty(true)
                }}
                placeholder="http://localhost:8178"
              />
            </Field>
            <div className="flex justify-end">
              <SoftButton
                type="button"
                tone={addressDirty ? 'primary' : 'success'}
                disabled={!addressDirty}
                onClick={() => {
                  void save({ base_url: address, enabled: address.trim() !== '' })
                  setAddressDirty(false)
                }}
              >
                {addressDirty ? 'Save address' : 'Saved'}
              </SoftButton>
            </div>
          </div>
        </details>

        {(error || whisper.error) && (
          <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
            {error || whisper.error}
          </div>
        )}
      </div>
    </ConfigCard>
  )
}
