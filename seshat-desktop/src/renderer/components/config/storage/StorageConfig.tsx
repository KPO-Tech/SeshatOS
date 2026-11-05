import { useEffect, useState } from 'react'
import { ActionButton, Notice, SelectField, SettingRow, SettingsCard, SettingsPage, StatusBadge, TextField } from '../../settings/kit'
import { fetchStorageStatus, saveStorageConfig } from './storageApi'
import type { StorageForm, StorageStatus } from './storageTypes'
import { storageFormFromStatus } from './storageUtils'
import { useTranslation } from 'react-i18next'

const providerOptions = [
  { value: 'local', label: 'config:storage.storageConfig.localDisk' },
  { value: 's3', label: 'config:storage.storageConfig.s3Compatible' }
]

/** Where generated files, attachments and long-lived artifacts are stored. */
export function StorageConfig() {
  const { t } = useTranslation('config')
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
      setMessage({ tone: 'ok', text: next.restart_required ? t('storage.storageConfig.savedRestart') : t('storage.storageConfig.saved') })
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
      badge={loading ? undefined : <StatusBadge tone={restart ? 'warn' : 'ok'}>{restart ? t('storage.storageConfig.restartRequired') : form.provider === 's3' ? 'S3' : t('storage.storageConfig.localDisk')}</StatusBadge>}
      actions={
        <ActionButton type="button" tone="primary" onClick={() => void save()} disabled={saving || loading}>
          {saving ? t('storage.storageConfig.saving') : t('storage.storageConfig.save')}
        </ActionButton>
      }
    >
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {!loading && (
        <SettingsCard title={t('storage.storageConfig.filesAndAttachments')}>
          <SettingRow title={t('storage.storageConfig.provider')}>
            <div className="w-[210px]">
              <SelectField value={form.provider} options={providerOptions.map((option) => ({ ...option, label: t(option.label) }))} onChange={(value) => set('provider', value)} />
            </div>
          </SettingRow>
          {form.provider === 'local' ? (
            field(t('storage.storageConfig.folder'), 'local_path', t('storage.storageConfig.defaultFolder'))
          ) : (
            <>
              {field(t('storage.storageConfig.endpoint'), 's3_endpoint', 'https://s3.amazonaws.com')}
              {field(t('storage.storageConfig.bucket'), 's3_bucket', 'seshat-artifacts')}
              {field(t('storage.storageConfig.region'), 's3_region', 'us-east-1')}
              {field(t('storage.storageConfig.keyPrefix'), 's3_key_prefix', t('storage.storageConfig.optional'))}
              {field(t('storage.storageConfig.accessKey'), 's3_access_key', status?.config.has_s3_access_key ? t('storage.storageConfig.keepCurrentKey') : t('storage.storageConfig.required'))}
              {field(t('storage.storageConfig.secretKey'), 's3_secret_key', status?.config.has_s3_secret_key ? t('storage.storageConfig.keepCurrentSecret') : t('storage.storageConfig.required'), 'password')}
            </>
          )}
        </SettingsCard>
      )}
    </SettingsPage>
  )
}
