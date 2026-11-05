import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@renderer/api/client'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { ActionButton, SettingRow, SettingsCard, SettingsPage, StatusBadge } from './kit'

type UpdateState = { kind: 'idle' } | { kind: 'checking' } | { kind: 'current' } | { kind: 'ready'; version: string } | { kind: 'failed'; message: string }

type SystemStatus = {
  status?: string
  mode?: string
  version?: string
  storage?: string
}

export function AboutSettings() {
  const { t } = useTranslation('settings')
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
    const result = await window.seshat?.updates?.checkNow().catch(() => ({ ok: false, error: t('about.checkFailed') }))
    if (result && !result.ok) setUpdate({ kind: 'failed', message: result.error ?? t('about.checkFailed') })
  }

  const updateLine =
    update.kind === 'ready'
      ? t('about.updateReady', { version: update.version })
      : update.kind === 'checking'
        ? t('about.checking')
        : update.kind === 'current'
          ? t('about.upToDate')
          : update.kind === 'failed'
            ? update.message
            : undefined

  return (
    <SettingsPage id="about">
      <SettingsCard padded>
        <div className="flex items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <SeshatLogo size={52} />
            <div className="min-w-0">
              <div className="text-[16px] font-semibold text-[var(--text-primary)]">SeshatOS Desktop</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">{updateLine ?? t('about.version', { version })}</div>
            </div>
          </div>
          {window.seshat?.updates &&
            (update.kind === 'ready' ? (
              <ActionButton type="button" tone="primary" onClick={() => void window.seshat?.updates?.quitAndInstall()}>
                {t('about.restart')}
              </ActionButton>
            ) : (
              <ActionButton type="button" disabled={update.kind === 'checking'} onClick={() => void checkForUpdate()}>
                {t('about.check')}
              </ActionButton>
            ))}
        </div>
      </SettingsCard>

      <SettingsCard title={t('about.systemCard')}>
        <SettingRow title={t('about.backend')}>
          <StatusBadge tone={reachable ? 'ok' : 'muted'}>{reachable === null ? t('about.checking') : reachable ? t('about.connected') : t('about.notDetected')}</StatusBadge>
        </SettingRow>
        <SettingRow title={t('about.mode')}>
          <span className="text-[12.5px] text-[var(--text-secondary)]">{status?.mode === 'connected' ? t('about.modeConnected') : t('about.modeLocal')}</span>
        </SettingRow>
        {status?.version && (
          <SettingRow title={t('about.backendVersion')}>
            <span className="text-[12.5px] text-[var(--text-secondary)]">{status.version}</span>
          </SettingRow>
        )}
      </SettingsCard>
    </SettingsPage>
  )
}
