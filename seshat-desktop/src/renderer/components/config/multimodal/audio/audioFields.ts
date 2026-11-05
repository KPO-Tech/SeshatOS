export type AudioField = {
  name: 'stt_model' | 'tts_model' | 'tts_voice' | 'tts_format'
  label: string
  placeholder: string
  suggestions?: readonly string[]
  choices?: ReadonlyArray<{ value: string; label: string }>
}

export const CLOUD_TRANSCRIPTION_FIELDS: readonly AudioField[] = [
  {
    name: 'stt_model',
    label: 'config:multimodal.audio.audioFields.transcriptionModel',
    placeholder: 'config:multimodal.audio.audioFieldRows.providerDefault',
    suggestions: ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe']
  }
]

export const VOICE_FIELDS: readonly AudioField[] = [
  {
    name: 'tts_model',
    label: 'config:multimodal.audio.audioFields.voiceModel',
    placeholder: 'config:multimodal.audio.audioFieldRows.providerDefault',
    suggestions: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts']
  },
  {
    name: 'tts_voice',
    label: 'config:multimodal.audio.audioFields.voice',
    placeholder: 'config:multimodal.audio.audioFieldRows.providerDefault',
    suggestions: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']
  },
  {
    name: 'tts_format',
    label: 'config:multimodal.audio.audioFields.audioFormat',
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

export const AUDIO_FIELD_NAMES = [...CLOUD_TRANSCRIPTION_FIELDS, ...VOICE_FIELDS].map((field) => field.name)
