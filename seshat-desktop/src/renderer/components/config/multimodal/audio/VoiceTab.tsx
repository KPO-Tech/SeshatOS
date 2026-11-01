import { VolumeNotice } from '@icon-park/react'
import { SettingsCard } from '../../../settings/kit'
import { AudioFieldRows } from './AudioFieldRows'
import { VOICE_FIELDS } from './audioFields'
import type { AudioDraft } from './useAudioDraft'

/** Speech synthesis: how the agent speaks when it reads a text aloud. */
export function VoiceTab({ draft }: { draft: AudioDraft }) {
  return (
    <SettingsCard title="Reading aloud" icon={<VolumeNotice theme="outline" size={16} />}>
      <AudioFieldRows fields={VOICE_FIELDS} draft={draft} />
    </SettingsCard>
  )
}
