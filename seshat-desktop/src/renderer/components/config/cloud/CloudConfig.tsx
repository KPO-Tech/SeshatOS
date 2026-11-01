import { useEffect, useState } from 'react'
import { ActionButton, Chip, Notice, SettingRow, SettingsCard, SettingsPage, StatusBadge, TextField } from '../../settings/kit'
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

  const connected = Boolean(status?.connected)

  return (
    <SettingsPage id="cloud" badge={loading ? undefined : <StatusBadge tone={connected ? 'ok' : 'muted'}>{connected ? 'Connected' : 'Not connected'}</StatusBadge>}>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {!loading && status?.connected && (
        <>
          <SettingsCard title={status.device_name || 'This device'}>
            <SettingRow title="Server">
              <span className="text-[12.5px] text-[var(--text-secondary)]">{status.server_url || 'SeshatCloud'}</span>
            </SettingRow>
            <SettingRow title="Device">
              <span className="font-mono text-[12px] text-[var(--text-secondary)]">{status.device_id || 'Unknown'}</span>
            </SettingRow>
            <SettingRow title="Connected since">
              <span className="text-[12.5px] text-[var(--text-secondary)]">{formatDate(status.connected_at)}</span>
            </SettingRow>
            <SettingRow title="Policies">
              <span className="text-[12.5px] text-[var(--text-secondary)]">{Object.keys(status.policies ?? {}).length}</span>
            </SettingRow>
            <SettingRow title="Disconnect this device">
              <ActionButton type="button" tone="danger" disabled={busy === 'disconnect'} onClick={() => void disconnectDevice()}>
                {busy === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
              </ActionButton>
            </SettingRow>
          </SettingsCard>
          {status.rules && <OrganizationRules rules={status.rules} />}
        </>
      )}

      {!loading && !status?.connected && (
        <SettingsCard title="Connect to SeshatCloud">
          <SettingRow title="Sign in on this computer" hint="When it is already signed in to your organization.">
            <ActionButton type="button" onClick={() => void registerDevice()} disabled={busy === 'register'}>
              {busy === 'register' ? 'Registering...' : 'Register device'}
            </ActionButton>
          </SettingRow>
          <SettingRow title="Server">
            <TextField label="Server URL" value={serverUrl} onChange={setServerUrl} placeholder="https://server.example.com" mono />
          </SettingRow>
          <SettingRow title="Device token">
            <TextField label="Device token" type="password" value={deviceToken} onChange={setDeviceToken} placeholder="Paste token" />
            <ActionButton type="button" tone="primary" disabled={busy === 'connect' || !serverUrl.trim() || !deviceToken.trim()} onClick={() => void connectDevice()}>
              {busy === 'connect' ? 'Connecting...' : 'Connect'}
            </ActionButton>
          </SettingRow>
        </SettingsCard>
      )}
    </SettingsPage>
  )
}

// The organization's rules for agents, read-only: the administrator sets them in SeshatCloud. They
// are kept while this desktop is offline and removed when it disconnects.
function OrganizationRules({ rules }: { rules: NonNullable<CloudStatus['rules']> }) {
  return (
    <SettingsCard title="Organization rules" padded>
      <div className="grid gap-3">
        {rules.instructions.trim() && <div className="whitespace-pre-wrap text-[13px] text-[var(--text-primary)]">{rules.instructions}</div>}
        {rules.forbidden_tools.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rules.forbidden_tools.map((tool) => (
              <Chip key={tool} tone="warn">
                {tool}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </SettingsCard>
  )
}

function formatDate(value?: string) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
