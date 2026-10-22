import { CapabilitySourceCard } from './CapabilitySourceCard'
import { useCapabilityOptions } from './capabilityOptions'
import { LocalSpeechCard } from './LocalSpeechCard'
import { OptionsCard, type OptionDefinition } from './OptionsCard'
import { useCapabilities } from './useCapabilities'

const SPEECH_TO_TEXT_OPTIONS: readonly OptionDefinition[] = [
  {
    name: 'stt_model',
    label: 'Transcription model',
    hint: 'Used when the provider transcribes (the local engine above comes first). Leave empty for the default of the provider.',
    placeholder: 'Provider default',
    suggestions: ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe']
  }
]

const SPEECH_OPTIONS: readonly OptionDefinition[] = [
  {
    name: 'tts_model',
    label: 'Voice model',
    hint: 'The model that speaks. Leave empty for the default of the provider.',
    placeholder: 'Provider default',
    suggestions: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts']
  },
  {
    name: 'tts_voice',
    label: 'Voice',
    hint: 'The name of the voice, as the provider calls it.',
    placeholder: 'Provider default',
    suggestions: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']
  },
  {
    name: 'tts_format',
    label: 'Audio format',
    hint: 'MP3 plays everywhere; WAV is larger but lossless.',
    placeholder: '',
    choices: [
      { value: 'mp3', label: 'MP3' },
      { value: 'wav', label: 'WAV' },
      { value: 'opus', label: 'Opus' },
      { value: 'aac', label: 'AAC' },
      { value: 'flac', label: 'FLAC' }
    ]
  }
]

export function AudioConfig() {
  const capabilities = useCapabilities()
  const options = useCapabilityOptions('audio')

  return (
    <div className="grid gap-6">
      {capabilities.error && (
        <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
          {capabilities.error}
        </div>
      )}

      <section className="grid gap-4">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">Speech to text</h2>
        <LocalSpeechCard
          config={capabilities.snapshot.localSTT}
          configured={capabilities.snapshot.status?.local_stt_configured}
          onSaved={capabilities.setLocalSTT}
        />
        <OptionsCard
          title="Cloud transcription"
          description="When the local engine is off, dictation and the agent transcribe with the audio provider below."
          options={SPEECH_TO_TEXT_OPTIONS}
          saved={options.saved}
          loading={options.loading}
          onSave={options.save}
        />
      </section>

      <section className="grid gap-4">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">Speech synthesis</h2>
        <OptionsCard
          title="Reading aloud"
          description="How the agent speaks when it reads a text aloud."
          options={SPEECH_OPTIONS}
          saved={options.saved}
          loading={options.loading}
          onSave={options.save}
        />
      </section>

      <section className="grid gap-4">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">Audio provider</h2>
        <CapabilitySourceCard
          capability="audio"
          title="Provider"
          description="The provider used for cloud transcription and speech synthesis. It reuses the key saved in Providers."
          configured={Boolean(capabilities.audio?.linked_provider_id)}
          status={capabilities.audio}
          onChanged={capabilities.reload}
        />
      </section>
    </div>
  )
}
