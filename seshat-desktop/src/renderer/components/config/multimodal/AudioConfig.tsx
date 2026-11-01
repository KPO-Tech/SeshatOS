import { useState } from 'react'
import { ActionButton, SettingsPage, SettingsTabs, StatusBadge, type SettingsTab } from '../../settings/kit'
import { DictationTab } from './audio/DictationTab'
import { ProviderTab } from './audio/ProviderTab'
import { useAudioDraft } from './audio/useAudioDraft'
import { VoiceTab } from './audio/VoiceTab'
import { useCapabilities } from './useCapabilities'
import { useWhisper } from './useWhisper'

type Tab = 'dictation' | 'voice' | 'provider'
const TABS: Array<SettingsTab<Tab>> = [
  { id: 'dictation', label: 'Dictation' },
  { id: 'voice', label: 'Voice' },
  { id: 'provider', label: 'Provider' }
]

/** Audio: dictation and transcription (on this computer first), the voice of speech synthesis, and the provider behind the cloud. */
export function AudioConfig() {
  const [tab, setTab] = useState<Tab>('dictation')
  const [error, setError] = useState<string | null>(null)
  const capabilities = useCapabilities()
  const whisper = useWhisper()
  const draft = useAudioDraft()

  const local = (whisper.state?.running ?? false) || Boolean(capabilities.snapshot.localSTT?.enabled) || Boolean(capabilities.snapshot.status?.local_stt_configured)
  const cloud = Boolean(capabilities.audio?.linked_provider_id)
  const badge = local ? <StatusBadge tone="ok">On this computer</StatusBadge> : cloud ? <StatusBadge tone="ok">Cloud</StatusBadge> : <StatusBadge tone="muted">Not set up</StatusBadge>
  const message = error || capabilities.error || whisper.error || draft.error

  return (
    <SettingsPage
      id="audio"
      badge={badge}
      tabs={<SettingsTabs tabs={TABS} value={tab} onChange={setTab} />}
      actions={
        tab !== 'provider' && (
          <>
            {draft.dirty && <span className="text-[12px] text-[var(--text-muted)]">Unsaved changes</span>}
            <ActionButton type="button" tone={draft.dirty ? 'primary' : 'default'} disabled={!draft.dirty || draft.saving} onClick={() => void draft.save()}>
              {draft.saving ? 'Saving...' : draft.dirty ? 'Save changes' : 'Saved'}
            </ActionButton>
          </>
        )
      }
    >
      {message && (
        <div className="rounded-xl border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{message}</div>
      )}
      {tab === 'dictation' && <DictationTab whisper={whisper} config={capabilities.snapshot.localSTT} draft={draft} onSaved={capabilities.setLocalSTT} onError={setError} />}
      {tab === 'voice' && <VoiceTab draft={draft} />}
      {tab === 'provider' && <ProviderTab status={capabilities.audio} onChanged={capabilities.reload} onError={setError} />}
    </SettingsPage>
  )
}
