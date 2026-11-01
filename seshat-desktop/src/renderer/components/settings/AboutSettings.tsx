import { useEffect, useState } from 'react'
import { api } from '@renderer/api/client'
import { ActionButton, SettingRow, SettingsCard, SettingsPage, StatusBadge } from './kit'

type UpdateState = { kind: 'idle' } | { kind: 'checking' } | { kind: 'current' } | { kind: 'ready'; version: string } | { kind: 'failed'; message: string }

type SystemStatus = {
  status?: string
  mode?: string
  version?: string
  storage?: string
}

export function AboutSettings() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [version, setVersion] = useState('0.1.0')
  const [update, setUpdate] = useState<UpdateState>({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    void window.seshat?.getVersion().then((value) => { if (!cancelled) setVersion(value) }).catch(() => undefined)
    api.get<SystemStatus>('/system/status')
      .then((result) => {
        if (cancelled) return
        setStatus(result)
        setReachable(true)
      })
      .catch(() => {
        if (!cancelled) setReachable(false)
      })
    const updates = window.seshat?.updates
    void updates?.ready().then((ready) => { if (!cancelled && ready) setUpdate({ kind: 'ready', version: ready.version }) }).catch(() => undefined)
    const stops = updates
      ? [
          updates.onDownloaded((payload) => setUpdate({ kind: 'ready', version: payload.version })),
          updates.onNotAvailable(() => setUpdate((state) => (state.kind === 'checking' ? { kind: 'current' } : state))),
          updates.onError((payload) => setUpdate({ kind: 'failed', message: payload.message })),
        ]
      : []
    return () => {
      cancelled = true
      stops.forEach((stop) => stop())
    }
  }, [])

  const checkForUpdate = async () => {
    setUpdate({ kind: 'checking' })
    const result = await window.seshat?.updates?.checkNow().catch(() => ({ ok: false, error: 'The check failed.' }))
    if (result && !result.ok) setUpdate({ kind: 'failed', message: result.error ?? 'The check failed.' })
  }

  const updateLine =
    update.kind === 'ready'
      ? `SeshatOS ${update.version} is ready to install.`
      : update.kind === 'checking'
        ? 'Checking...'
        : update.kind === 'current'
          ? 'You have the latest version.'
          : update.kind === 'failed'
            ? update.message
            : undefined

  return (
    <SettingsPage id="about" badge={<StatusBadge tone="muted">{`v${version}`}</StatusBadge>}>
      <SettingsCard title="SeshatOS Desktop">
        <SettingRow title="Version">
          <span className="text-[12.5px] text-[var(--text-secondary)]">{version}</span>
        </SettingRow>
        <SettingRow title="Backend">
          <StatusBadge tone={reachable ? 'ok' : 'muted'}>{reachable === null ? 'Checking...' : reachable ? 'Connected' : 'Not detected'}</StatusBadge>
        </SettingRow>
        <SettingRow title="Mode">
          <span className="text-[12.5px] text-[var(--text-secondary)]">{status?.mode || 'Local workspace'}</span>
        </SettingRow>
        {status?.version && (
          <SettingRow title="Backend version">
            <span className="text-[12.5px] text-[var(--text-secondary)]">{status.version}</span>
          </SettingRow>
        )}
      </SettingsCard>

      {window.seshat?.updates && (
        <SettingsCard>
          <SettingRow title="Updates" hint={updateLine}>
            {update.kind === 'ready' ? (
              <ActionButton type="button" tone="primary" onClick={() => void window.seshat?.updates?.quitAndInstall()}>
                Restart and install
              </ActionButton>
            ) : (
              <ActionButton type="button" disabled={update.kind === 'checking'} onClick={() => void checkForUpdate()}>
                Check for updates
              </ActionButton>
            )}
          </SettingRow>
        </SettingsCard>
      )}
    </SettingsPage>
  )
}
