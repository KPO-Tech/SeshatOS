import { useEffect, useState } from 'react'
import { ConfigCard, CustomSelect, Field, SoftButton, StatusPill, TextInput } from '../knowledge/KnowledgePrimitives'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import { fetchStorageStatus, saveStorageConfig } from './storageApi'
import type { StorageForm, StorageStatus } from './storageTypes'
import { storageFormFromStatus } from './storageUtils'

const providerOptions = [
  { value: 'local', label: 'Local disk', description: 'Use the default local artifact store' },
  { value: 's3', label: 'S3 compatible', description: 'AWS S3, MinIO, R2, or Backblaze' }
]

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
      setMessage({ tone: 'ok', text: next.restart_required ? 'Storage saved. Restart the backend to apply it.' : 'Storage settings saved.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to save storage settings.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {message && (
        <div className={[
          'rounded-lg border bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold',
          message.tone === 'ok' ? 'border-[var(--accent-success)]/35 text-[var(--accent-success)]' : 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)]'
        ].join(' ')}>
          {message.text}
        </div>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Metric label="Active provider" value={status?.active_provider || 'local'} />
        <Metric label="Configured" value={status?.config.provider || 'local'} />
        <Metric label="State" value={status?.restart_required ? 'Restart' : 'Ready'} />
      </section>

      {loading ? (
        <ProviderEmptyState label="Loading storage configuration..." />
      ) : (
        <ConfigCard
          title="Artifact storage"
          description="Controls where generated files, uploaded attachments, and long-lived artifacts are stored."
          status={<StatusPill tone={status?.restart_required ? 'warn' : 'ok'}>{status?.restart_required ? 'Restart required' : 'Active'}</StatusPill>}
          action={<SoftButton tone="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving...' : 'Save'}</SoftButton>}
        >
          <div className="grid gap-4">
            <Field label="Provider">
              <CustomSelect value={form.provider} options={providerOptions} onChange={(value) => set('provider', value)} />
            </Field>

            {form.provider === 'local' ? (
              <Field label="Local path">
                <TextInput value={form.local_path} onChange={(event) => set('local_path', event.target.value)} placeholder="Backend default if empty" />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Endpoint">
                    <TextInput value={form.s3_endpoint} onChange={(event) => set('s3_endpoint', event.target.value)} placeholder="https://s3.amazonaws.com" />
                  </Field>
                  <Field label="Bucket">
                    <TextInput value={form.s3_bucket} onChange={(event) => set('s3_bucket', event.target.value)} placeholder="seshat-artifacts" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Region">
                    <TextInput value={form.s3_region} onChange={(event) => set('s3_region', event.target.value)} placeholder="us-east-1" />
                  </Field>
                  <Field label="Key prefix">
                    <TextInput value={form.s3_key_prefix} onChange={(event) => set('s3_key_prefix', event.target.value)} placeholder="Optional" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Access key">
                    <TextInput value={form.s3_access_key} onChange={(event) => set('s3_access_key', event.target.value)} placeholder={status?.config.has_s3_access_key ? 'Keep current key' : 'Required'} />
                  </Field>
                  <Field label="Secret key">
                    <TextInput type="password" value={form.s3_secret_key} onChange={(event) => set('s3_secret_key', event.target.value)} placeholder={status?.config.has_s3_secret_key ? 'Keep current secret' : 'Required'} />
                  </Field>
                </div>
              </>
            )}
          </div>
        </ConfigCard>
      )}

      <ConfigCard title="Storage health" description="Current storage runtime state reported by the backend." status={<StatusPill tone="muted">Read only</StatusPill>}>
        <div className="grid grid-cols-2 gap-2">
          <Info label="Is configured" value={status?.config.is_configured ? 'Yes' : 'No'} />
          <Info label="Last update" value={status?.config.updated_at ? new Date(status.config.updated_at * 1000).toLocaleString() : 'Never'} />
        </div>
      </ConfigCard>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5">
      <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-[20px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
      <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}
