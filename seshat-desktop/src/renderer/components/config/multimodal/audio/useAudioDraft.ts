import { useEffect, useState } from 'react'
import { useCapabilityOptions } from '../capabilityOptions'
import { AUDIO_FIELD_NAMES } from './audioFields'

/** The audio choices being edited (cloud model, voice, format), saved together; an empty value keeps the provider default. */
export function useAudioDraft() {
  const options = useCapabilityOptions('audio')
  const [form, setForm] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(Object.fromEntries(AUDIO_FIELD_NAMES.map((name) => [name, options.saved[name] ?? ''])))
    setDirty(false)
  }, [options.saved])

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
    setDirty(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await options.save({ ...options.saved, ...form })
      setDirty(false)
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to save these settings.')
    } finally {
      setSaving(false)
    }
  }

  return { form, dirty, saving, error, loading: options.loading, update, save }
}

export type AudioDraft = ReturnType<typeof useAudioDraft>
