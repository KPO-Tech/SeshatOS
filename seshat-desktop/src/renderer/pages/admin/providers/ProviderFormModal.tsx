import { useState } from 'react'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { ProviderCatalogEntry } from '@renderer/components/config/providers/providerTypes'
import { AdminModal, AdminModalButton, AdminModalError, AdminModalField, adminInputClass } from '../shared/AdminModal'
import { createAdminProviderSetting, updateAdminProviderSetting } from './useAdminProviderSettings'
import type { OrgProviderSetting } from '../types'

export function ProviderFormModal({
  entry,
  existing,
  onClose,
  onSuccess,
}: {
  entry: ProviderCatalogEntry
  existing?: OrgProviderSetting
  onClose: () => void
  onSuccess: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [defaultModel, setDefaultModel] = useState(existing?.default_model ?? '')
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      if (existing) {
        await updateAdminProviderSetting(existing.id, { default_model: defaultModel || undefined, base_url: baseUrl || undefined, api_key: apiKey || undefined })
      } else {
        await createAdminProviderSetting({ provider: entry.name, default_model: defaultModel || undefined, base_url: baseUrl || undefined, api_key: apiKey })
      }
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this provider setting.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminModal
      title={existing ? `Edit ${entry.display_name}` : `Configure ${entry.display_name}`}
      onClose={onClose}
      footer={
        <>
          <AdminModalButton variant="cancel" onClick={onClose}>Cancel</AdminModalButton>
          <AdminModalButton disabled={submitting || (!existing && !apiKey.trim())} onClick={handleSubmit}>
            {submitting ? 'Saving…' : 'Save'}
          </AdminModalButton>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <ProviderIcon provider={entry.name} size={28} />
        <div>
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{entry.display_name}</div>
          {entry.description && <div className="text-[11px] text-[var(--text-muted)]">{entry.description}</div>}
        </div>
      </div>

      <AdminModalField label="API key" hint={existing ? undefined : '(required)'}>
        <input
          type="password"
          className={adminInputClass}
          placeholder={existing ? 'Leave empty to keep the current key' : 'Enter the API key…'}
          value={apiKey}
          autoFocus
          onChange={(e) => setApiKey(e.target.value)}
        />
      </AdminModalField>

      <AdminModalField label="Default model" hint="(optional)">
        <input type="text" className={adminInputClass} placeholder="e.g. claude-sonnet-5" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} />
      </AdminModalField>

      <AdminModalField label="Base URL" hint="(optional)">
        <input type="text" className={adminInputClass} placeholder="Leave empty to use the provider's default" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      </AdminModalField>

      {error && <AdminModalError message={error} />}
    </AdminModal>
  )
}
