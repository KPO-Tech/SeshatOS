import { useEffect, useState } from 'react'
import { ActionButton, Chip, Notice, SettingRow, SettingsCard, SettingsPage, StatusBadge, TextField } from '../../settings/kit'
import { connectCloudDevice, disconnectCloudDevice, fetchCloudStatus, registerCloudDevice } from './cloudApi'
import type { CloudStatus } from './cloudTypes'
import { useTranslation } from 'react-i18next'

// The link between this desktop and a SeshatCloud server: the organization's
// policies and minimum app version reach the desktop through it. It runs no
// automation: scheduled work lives in SeshatCloud only.
export function CloudConfig() {
  const { t } = useTranslation('config')
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
    <SettingsPage id="cloud" badge={loading ? undefined : <StatusBadge tone={connected ? 'ok' : 'muted'}>{connected ? t('cloud.cloudConfig.connected') : t('cloud.cloudConfig.notConnected')}</StatusBadge>}>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {!loading && status?.connected && (
        <>
          <SettingsCard title={status.device_name || t('cloud.cloudConfig.thisDevice')}>
            <SettingRow title={t('cloud.cloudConfig.server')}>
              <span className="text-[12.5px] text-[var(--text-secondary)]">{status.server_url || t('cloud.cloudConfig.seshatcloud')}</span>
            </SettingRow>
            <SettingRow title={t('cloud.cloudConfig.device')}>
              <span className="font-mono text-[12px] text-[var(--text-secondary)]">{status.device_id || t('cloud.cloudConfig.unknown')}</span>
            </SettingRow>
            <SettingRow title={t('cloud.cloudConfig.connectedSince')}>
              <span className="text-[12.5px] text-[var(--text-secondary)]">{formatDate(status.connected_at)}</span>
            </SettingRow>
            <SettingRow title={t('cloud.cloudConfig.policies')}>
              <span className="text-[12.5px] text-[var(--text-secondary)]">{Object.keys(status.policies ?? {}).length}</span>
            </SettingRow>
            <SettingRow title={t('cloud.cloudConfig.disconnectThisDevice')}>
              <ActionButton type="button" tone="danger" disabled={busy === 'disconnect'} onClick={() => void disconnectDevice()}>
                {busy === 'disconnect' ? t('cloud.cloudConfig.disconnecting') : t('cloud.cloudConfig.disconnect')}
              </ActionButton>
            </SettingRow>
          </SettingsCard>
          {status.rules && <OrganizationRules rules={status.rules} />}
        </>
      )}

      {!loading && !status?.connected && (
        <SettingsCard title={t('cloud.cloudConfig.connectToSeshatcloud')}>
          <SettingRow title={t('cloud.cloudConfig.signInOnThisComputer')} hint={t('cloud.cloudConfig.whenItIsAlreadySigned')}>
            <ActionButton type="button" onClick={() => void registerDevice()} disabled={busy === 'register'}>
              {busy === 'register' ? t('cloud.cloudConfig.registering') : t('cloud.cloudConfig.registerDevice')}
            </ActionButton>
          </SettingRow>
          <SettingRow title={t('cloud.cloudConfig.server')}>
            <TextField label={t('cloud.cloudConfig.serverUrl')} value={serverUrl} onChange={setServerUrl} placeholder="https://server.example.com" mono />
          </SettingRow>
          <SettingRow title={t('cloud.cloudConfig.deviceToken')}>
            <TextField label={t('cloud.cloudConfig.deviceToken')} type="password" value={deviceToken} onChange={setDeviceToken} placeholder={t('cloud.cloudConfig.pasteToken')} />
            <ActionButton type="button" tone="primary" disabled={busy === 'connect' || !serverUrl.trim() || !deviceToken.trim()} onClick={() => void connectDevice()}>
              {busy === 'connect' ? t('cloud.cloudConfig.connecting') : t('cloud.cloudConfig.connect')}
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
  const { t } = useTranslation('config')
  return (
    <SettingsCard title={t('cloud.cloudConfig.organizationRules')} padded>
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
