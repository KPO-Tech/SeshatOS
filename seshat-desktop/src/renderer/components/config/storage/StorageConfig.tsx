import { useEffect, useState } from 'react'
import { ActionButton, Notice, SelectField, SettingRow, SettingsCard, SettingsPage, StatusBadge, TextField } from '../../settings/kit'
import { fetchStorageStatus, saveStorageConfig } from './storageApi'
import type { StorageForm, StorageStatus } from './storageTypes'
import { storageFormFromStatus } from './storageUtils'

const providerOptions = [
  { value: 'local', label: 'Local disk' },
  { value: 's3', label: 'S3 compatible' }
]

/** Where generated files, attachments and long-lived artifacts are stored. */
export function StorageConfig() {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [form, setForm] = useState<StorageForm>(() => storageFormFromStatus(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    setMessage(null)
    try {
      const next = await fetchStorageStatus()
      setStatus(next)
      setForm(storageFormFromStatus(next))
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load storage settings.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function set<K extends keyof StorageForm>(key: K, value: StorageForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const next = await saveStorageConfig(form)
      setStatus(next)
      setForm(storageFormFromStatus(next))
      setMessage({ tone: 'ok', text: next.restart_required ? 'Saved. Restart the backend to apply it.' : 'Saved.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to save storage settings.' })
    } finally {
      setSaving(false)
    }
  }

  const restart = Boolean(status?.restart_required)
  const field = (label: string, key: keyof StorageForm, placeholder: string, type: 'text' | 'password' = 'text') => (
    <SettingRow title={label}>
      <TextField label={label} type={type} value={form[key]} onChange={(value) => set(key, value)} placeholder={placeholder} />
    </SettingRow>
  )

  return (
    <SettingsPage
      id="storage"
      badge={loading ? undefined : <StatusBadge tone={restart ? 'warn' : 'ok'}>{restart ? 'Restart required' : form.provider === 's3' ? 'S3' : 'Local disk'}</StatusBadge>}
      actions={
        <ActionButton type="button" tone="primary" onClick={() => void save()} disabled={saving || loading}>
          {saving ? 'Saving...' : 'Save'}
        </ActionButton>
      }
    >
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {!loading && (
        <SettingsCard title="Files and attachments">
          <SettingRow title="Provider">
            <div className="w-[210px]">
              <SelectField value={form.provider} options={providerOptions} onChange={(value) => set('provider', value)} />
            </div>
          </SettingRow>
          {form.provider === 'local' ? (
            field('Folder', 'local_path', 'Default folder')
          ) : (
            <>
              {field('Endpoint', 's3_endpoint', 'https://s3.amazonaws.com')}
              {field('Bucket', 's3_bucket', 'seshat-artifacts')}
              {field('Region', 's3_region', 'us-east-1')}
              {field('Key prefix', 's3_key_prefix', 'Optional')}
              {field('Access key', 's3_access_key', status?.config.has_s3_access_key ? 'Keep current key' : 'Required')}
              {field('Secret key', 's3_secret_key', status?.config.has_s3_secret_key ? 'Keep current secret' : 'Required', 'password')}
            </>
          )}
        </SettingsCard>
      )}
    </SettingsPage>
  )
}
