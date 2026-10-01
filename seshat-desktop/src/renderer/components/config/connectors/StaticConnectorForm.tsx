import { useState } from 'react'
import { Field, SoftButton, TextInput } from '../knowledge/KnowledgePrimitives'
import type { ConnectAccountPayload, ConnectorKind } from './connectorTypes'

export function StaticConnectorForm({
  kind,
  saving,
  onCancel,
  onSubmit
}: {
  kind: ConnectorKind
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: ConnectAccountPayload) => Promise<void>
}) {
  const [displayName, setDisplayName] = useState('')
  const [bucket, setBucket] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [prefix, setPrefix] = useState('')
  const [accessKey, setAccessKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [crmToken, setCrmToken] = useState('')
  const [crmAccount, setCrmAccount] = useState('demo-crm')
  const [error, setError] = useState<string | null>(null)

  const isS3 = kind === 's3'

  async function submit() {
    if (isS3 && (!bucket.trim() || !endpoint.trim() || !accessKey.trim() || !secretKey.trim())) {
      setError('Bucket, endpoint, access key, and secret key are required.')
      return
    }
    if (!isS3 && !crmToken.trim()) {
      setError('Access token is required.')
      return
    }
    setError(null)
    if (isS3) {
      await onSubmit({
        display_name: displayName.trim() || bucket.trim(),
        external_account_id: bucket.trim(),
        access_token: accessKey.trim(),
        refresh_token: secretKey.trim(),
        config: { bucket: bucket.trim(), region: region.trim(), endpoint: endpoint.trim(), prefix: prefix.trim() }
      })
      return
    }
    await onSubmit({
      display_name: displayName.trim() || 'Demo CRM',
      external_account_id: crmAccount.trim() || 'demo-crm',
      access_token: crmToken.trim()
    })
  }

  return (
    <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-soft)] px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Connect {isS3 ? 'S3-compatible storage' : 'Demo CRM'}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Credentials are sent to the backend and stored in the connector account vault.</p>
        </div>
        <div className="flex items-center gap-2">
          <SoftButton onClick={onCancel}>Cancel</SoftButton>
          <SoftButton tone="primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Connecting...' : 'Connect'}</SoftButton>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        {error && <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
        <Field label="Display name">
          <TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={isS3 ? 'Company docs bucket' : 'Demo CRM workspace'} />
        </Field>
        {isS3 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bucket">
                <TextInput value={bucket} onChange={(event) => setBucket(event.target.value)} placeholder="my-bucket" />
              </Field>
              <Field label="Region">
                <TextInput value={region} onChange={(event) => setRegion(event.target.value)} placeholder="us-east-1" />
              </Field>
            </div>
            <Field label="Endpoint">
              <TextInput value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="http://127.0.0.1:9000" />
            </Field>
            <Field label="Prefix">
              <TextInput value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="Optional, e.g. docs/" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Access key ID">
                <TextInput value={accessKey} onChange={(event) => setAccessKey(event.target.value)} />
              </Field>
              <Field label="Secret access key">
                <TextInput type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} />
              </Field>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="External account ID">
              <TextInput value={crmAccount} onChange={(event) => setCrmAccount(event.target.value)} />
            </Field>
            <Field label="Access token">
              <TextInput type="password" value={crmToken} onChange={(event) => setCrmToken(event.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </section>
  )
}
