import { useEffect, useState } from 'react'
import { ConfigCard, Field, SoftButton, StatusPill, TextInput, ToggleSwitch } from '../knowledge/KnowledgePrimitives'
import { saveLocalSTT } from './multimodalApi'
import { CapabilityIcon } from './MultimodalIcons'
import type { LocalSTTConfig } from './multimodalTypes'

export function LocalSpeechCard({ config, configured, onSaved }: { config: LocalSTTConfig | null; configured?: boolean; onSaved: (config: LocalSTTConfig) => void }) {
  const [form, setForm] = useState({
    base_url: config?.base_url || '',
    enabled: config?.enabled ?? false
  })
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (config) setForm({ base_url: config.base_url || '', enabled: config.enabled })
  }, [config])

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveLocalSTT(form)
      onSaved(saved)
      setDirty(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to save local speech settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConfigCard
      title="Local speech to text"
      description="Use a local whisper.cpp compatible server before falling back to the cloud audio source."
      status={<StatusPill tone={configured || form.enabled ? 'ok' : 'muted'}>{configured || form.enabled ? 'Enabled' : 'Off'}</StatusPill>}
      action={<CapabilityIcon name="whisper" />}
    >
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-5 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
          <div>
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">Prefer local transcription</div>
            <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">The backend uses this endpoint when enabled and reachable.</div>
          </div>
          <ToggleSwitch enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />
        </div>

        <Field label="Whisper server URL">
          <TextInput value={form.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="http://localhost:8178" />
        </Field>

        <div className="rounded-md border border-dashed border-[var(--border-soft)] px-3 py-2.5 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
          Automatic model download/start is not wired in the new desktop bridge yet. For now this panel can point the backend at an already running local server.
        </div>

        {error && (
          <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end">
          <SoftButton type="button" tone={dirty ? 'primary' : 'success'} onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </SoftButton>
        </div>
      </div>
    </ConfigCard>
  )
}
