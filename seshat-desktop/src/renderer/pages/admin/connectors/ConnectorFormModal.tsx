import { useState } from 'react'
import { AdminModal, AdminModalButton, AdminModalError, AdminModalField, adminInputClass } from '../shared/AdminModal'
import { registerAdminConnectorOAuthApp } from './useAdminConnectorOAuthApps'
import type { ConnectorOAuthApp } from '../types'

export function ConnectorFormModal({
  kind,
  label,
  existing,
  onClose,
  onSuccess,
}: {
  kind: string
  label: string
  existing?: ConnectorOAuthApp
  onClose: () => void
  onSuccess: () => void
}) {
  const [clientId, setClientId] = useState(existing?.client_id ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [subdomain, setSubdomain] = useState(existing?.subdomain ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await registerAdminConnectorOAuthApp(kind, {
        client_id: clientId,
        client_secret: clientSecret || undefined,
        subdomain: kind === 'zendesk' ? subdomain : undefined,
      })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this connector app.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = clientId.trim() && (existing?.configured || clientSecret.trim()) && (kind !== 'zendesk' || subdomain.trim())

  return (
    <AdminModal
      title={existing?.configured ? `Edit ${label}` : `Configure ${label}`}
      onClose={onClose}
      footer={
        <>
          <AdminModalButton variant="cancel" onClick={onClose}>Cancel</AdminModalButton>
          <AdminModalButton disabled={submitting || !canSubmit} onClick={handleSubmit}>{submitting ? 'Saving…' : 'Save'}</AdminModalButton>
        </>
      }
    >
      <AdminModalField label="Client ID">
        <input type="text" className={adminInputClass} value={clientId} autoFocus onChange={(e) => setClientId(e.target.value)} />
      </AdminModalField>

      <AdminModalField label="Client secret" hint={existing?.configured ? undefined : '(required)'}>
        <input
          type="password"
          className={adminInputClass}
          placeholder={existing?.configured ? 'Leave empty to keep the current secret' : 'Enter the client secret…'}
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
        />
      </AdminModalField>

      {kind === 'zendesk' && (
        <AdminModalField label="Zendesk subdomain">
          <input type="text" className={adminInputClass} placeholder="acme" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} />
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Zendesk&apos;s own account subdomain, e.g. "acme" for acme.zendesk.com.</p>
        </AdminModalField>
      )}

      {error && <AdminModalError message={error} />}
    </AdminModal>
  )
}
