import { useEffect, useState } from 'react'
import { ConfigCard, Field, SoftButton, StatusPill, TextInput } from '../knowledge/KnowledgePrimitives'
import { ProviderEmptyState } from '../providers/ProviderEmptyState'
import { connectCloudDevice, disconnectCloudDevice, fetchCloudStatus, registerCloudDevice } from './cloudApi'
import type { CloudStatus } from './cloudTypes'

// The link between this desktop and a SeshatCloud server: the organization's
// policies and minimum app version reach the desktop through it. It runs no
// automation: scheduled work lives in SeshatCloud only.
export function CloudConfig() {
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [serverUrl, setServerUrl] = useState('')
  const [deviceToken, setDeviceToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    setMessage(null)
    try {
      setStatus(await fetchCloudStatus())
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to load the SeshatCloud connection.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function registerDevice() {
    setBusy('register')
    setMessage(null)
    try {
      setStatus(await registerCloudDevice())
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to register this device.' })
    } finally {
      setBusy(null)
    }
  }

  async function connectDevice() {
    setBusy('connect')
    setMessage(null)
    try {
      setStatus(await connectCloudDevice(serverUrl, deviceToken))
      setDeviceToken('')
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to connect this device.' })
    } finally {
      setBusy(null)
    }
  }

  async function disconnectDevice() {
    setBusy('disconnect')
    setMessage(null)
    try {
      await disconnectCloudDevice()
      await load()
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to disconnect.' })
    } finally {
      setBusy(null)
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

      {loading ? (
        <ProviderEmptyState label="Loading the SeshatCloud connection..." />
      ) : status?.connected ? (
        <ConfigCard
          title={status.device_name || 'This device'}
          description={status.server_url || 'Connected to SeshatCloud.'}
          status={<StatusPill tone="ok">Connected</StatusPill>}
          action={<SoftButton tone="danger" disabled={busy === 'disconnect'} onClick={() => void disconnectDevice()}>{busy === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}</SoftButton>}
        >
          <div className="grid grid-cols-3 gap-2">
            <Info label="Device ID" value={status.device_id || 'Unknown'} />
            <Info label="Connected since" value={formatDate(status.connected_at)} />
            <Info label="Policy bundle" value={String(Object.keys(status.policies ?? {}).length)} />
          </div>
        </ConfigCard>
      ) : (
        <ConfigCard
          title="Connect to SeshatCloud"
          description="Pair this desktop with your organization's SeshatCloud so its policies and minimum app version apply here."
          status={<StatusPill tone="muted">Not connected</StatusPill>}
          action={<SoftButton onClick={() => void registerDevice()} disabled={busy === 'register'}>{busy === 'register' ? 'Registering...' : 'Register device'}</SoftButton>}
        >
          <div className="grid gap-4">
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
              Use one-click registration when this desktop is already signed in to an organization server. Otherwise paste a manual device token below.
            </div>
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
              <Field label="Server URL">
                <TextInput value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="https://server.example.com" />
              </Field>
              <Field label="Device token">
                <TextInput type="password" value={deviceToken} onChange={(event) => setDeviceToken(event.target.value)} placeholder="Paste token" />
              </Field>
              <SoftButton tone="primary" disabled={busy === 'connect' || !serverUrl.trim() || !deviceToken.trim()} onClick={() => void connectDevice()}>
                {busy === 'connect' ? 'Connecting...' : 'Connect'}
              </SoftButton>
            </div>
          </div>
        </ConfigCard>
      )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
      <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

function formatDate(value?: string) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
