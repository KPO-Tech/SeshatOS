import { useState } from 'react'
import { Field, SoftButton, TextInput } from '@renderer/components/config/knowledge/KnowledgePrimitives'
import type { ConnectAccountPayload, ConnectorKind } from './connectorTypes'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('knowledge/sources')
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
      setError(t('pages.knowledge.sources.staticConnectorForm.bucketEndpointAccessKeyAnd'))
      return
    }
    if (!isS3 && !crmToken.trim()) {
      setError(t('pages.knowledge.sources.staticConnectorForm.accessTokenIsRequired'))
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
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{t('pages.knowledge.sources.staticConnectorForm.connectName', { name: isS3 ? t('pages.knowledge.sources.staticConnectorForm.s3CompatibleStorage') : t('pages.knowledge.sources.staticConnectorForm.demoCrm') })}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">{t('pages.knowledge.sources.staticConnectorForm.credentialsAreSentToThe')}</p>
        </div>
        <div className="flex items-center gap-2">
          <SoftButton onClick={onCancel}>{t('pages.knowledge.sources.staticConnectorForm.cancel')}</SoftButton>
          <SoftButton tone="primary" onClick={() => void submit()} disabled={saving}>{saving ? t('pages.knowledge.sources.staticConnectorForm.connecting') : t('pages.knowledge.sources.staticConnectorForm.connect')}</SoftButton>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        {error && <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
        <Field label={t('pages.knowledge.sources.staticConnectorForm.displayName')}>
          <TextInput value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={isS3 ? t('pages.knowledge.sources.staticConnectorForm.companyDocsBucket') : t('pages.knowledge.sources.staticConnectorForm.demoCrmWorkspace')} />
        </Field>
        {isS3 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('pages.knowledge.sources.staticConnectorForm.bucket')}>
                <TextInput value={bucket} onChange={(event) => setBucket(event.target.value)} placeholder="my-bucket" />
              </Field>
              <Field label={t('pages.knowledge.sources.staticConnectorForm.region')}>
                <TextInput value={region} onChange={(event) => setRegion(event.target.value)} placeholder="us-east-1" />
              </Field>
            </div>
            <Field label={t('pages.knowledge.sources.staticConnectorForm.endpoint')}>
              <TextInput value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="http://127.0.0.1:9000" />
            </Field>
            <Field label={t('pages.knowledge.sources.staticConnectorForm.prefix')}>
              <TextInput value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder={t('pages.knowledge.sources.staticConnectorForm.optionalEGDocs')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('pages.knowledge.sources.staticConnectorForm.accessKeyId')}>
                <TextInput value={accessKey} onChange={(event) => setAccessKey(event.target.value)} />
              </Field>
              <Field label={t('pages.knowledge.sources.staticConnectorForm.secretAccessKey')}>
                <TextInput type="password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} />
              </Field>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('pages.knowledge.sources.staticConnectorForm.externalAccountId')}>
              <TextInput value={crmAccount} onChange={(event) => setCrmAccount(event.target.value)} />
            </Field>
            <Field label={t('pages.knowledge.sources.staticConnectorForm.accessToken')}>
              <TextInput type="password" value={crmToken} onChange={(event) => setCrmToken(event.target.value)} />
            </Field>
          </div>
        )}
      </div>
    </section>
  )
}
