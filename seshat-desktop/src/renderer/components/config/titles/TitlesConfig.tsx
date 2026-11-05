import { useCallback, useEffect, useState } from 'react'
import { ActionButton, Notice, ProgressRow, SettingRow, SettingsCard, SettingsPage, StatusBadge, TextField, Toggle, type Tone } from '../../settings/kit'
import { fetchLocalTitleConfig, formatBytes, type LocalTitleConfig } from './titlesApi'
import { useTranslation } from 'react-i18next'

type Progress = { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }

function errorMessage(error: unknown): string {
  const message = (error as { message?: string })?.message ?? 'Something went wrong.'
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function TitlesConfig() {
  const { t } = useTranslation('config')
  const llama = window.seshat?.llama
  const [status, setStatus] = useState<LlamaStatus | null>(null)
  const [backend, setBackend] = useState<LocalTitleConfig | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customRepo, setCustomRepo] = useState('')
  const [customFile, setCustomFile] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const refresh = useCallback(async () => {
    if (!llama) return
    setStatus(await llama.status())
    setBackend(await fetchLocalTitleConfig())
  }, [llama])

  useEffect(() => {
    if (!llama) return
    void refresh()
    const stop = llama.onProgress((next) => {
      setProgress(next)
      if (next.totalBytes > 0 && next.receivedBytes >= next.totalBytes) void refresh()
    })
    // The server starts a moment after the download ends, and the backend is told after that.
    const timer = window.setInterval(() => void refresh(), 4000)
    return () => {
      stop()
      window.clearInterval(timer)
    }
  }, [llama, refresh])

  async function run(action: () => Promise<LlamaStatus>) {
    setBusy(true)
    setError(null)
    try {
      setStatus(await action())
      setBackend(await fetchLocalTitleConfig())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  if (!llama) {
    return (
      <SettingsPage id="titles" badge={<StatusBadge tone="muted">{t('titles.titlesConfig.desktopOnly')}</StatusBadge>}>
        {null}
      </SettingsPage>
    )
  }

  const serving = Boolean(status?.running && backend?.enabled)
  const state: { tone: Tone; label: string } = !status
    ? { tone: 'muted', label: t('titles.titlesConfig.loading') }
    : !status.supported
      ? { tone: 'muted', label: t('titles.titlesConfig.notAvailable') }
      : serving
        ? { tone: 'ok', label: t('titles.titlesConfig.running') }
        : status.enabled
          ? { tone: 'warn', label: busy || !status.provisioned ? 'Installing' : 'Starting' }
          : { tone: 'muted', label: t('titles.titlesConfig.off') }
  const percent = progress && progress.totalBytes > 0 ? Math.min(100, (progress.receivedBytes / progress.totalBytes) * 100) : 5

  return (
    <SettingsPage id="titles" badge={<StatusBadge tone={state.tone}>{state.label}</StatusBadge>}>
      {error && <Notice tone="error">{error}</Notice>}

      <SettingsCard>
        <SettingRow title={t('titles.titlesConfig.nameChatsOnThisComputer')} hint={t('titles.titlesConfig.offTitlesComeFromYour')}>
          <Toggle label={t('titles.titlesConfig.nameChatsOnThisComputer')} enabled={Boolean(status?.enabled)} onChange={(enabled) => void run(() => (enabled ? llama.enable() : llama.disable()))} />
        </SettingRow>
        {progress && <ProgressRow label={progress.phase === 'binary' ? t('titles.titlesConfig.downloadingLlamaCpp') : t('titles.titlesConfig.downloadingTheTitleModel')} percent={percent} />}
        {status && !status.provisioned && status.supported && !busy && (
          <SettingRow title={t('titles.titlesConfig.runtimeAndModel')}>
            <ActionButton type="button" tone="primary" onClick={() => void run(() => llama.provision())}>
              {t('titles.titlesConfig.installNow')}
            </ActionButton>
          </SettingRow>
        )}
      </SettingsCard>

      <SettingsCard title={t('titles.titlesConfig.model')}>
        {status?.models.map((model) => {
          const downloaded = status.downloadedModelIds.includes(model.id)
          const active = status.activeModelId === model.id
          return (
            <SettingRow key={model.id} title={model.label} hint={model.description}>
              <span className="text-[12px] text-[var(--text-faint)]">{formatBytes(model.approxSizeBytes)}</span>
              {active ? (
                <StatusBadge tone="ok">{t('titles.titlesConfig.inUse')}</StatusBadge>
              ) : (
                <ActionButton type="button" tone={downloaded ? 'primary' : 'default'} disabled={busy || !status.supported} onClick={() => void run(() => llama.activateModel(model.id))}>
                  {downloaded ? t('titles.titlesConfig.use') : t('titles.titlesConfig.download')}
                </ActionButton>
              )}
              {downloaded && !active && (
                <ActionButton type="button" tone="danger" disabled={busy} onClick={() => void run(() => llama.deleteModel(model.id))}>
                  {t('titles.titlesConfig.delete')}
                </ActionButton>
              )}
            </SettingRow>
          )
        })}
        <SettingRow title={t('titles.titlesConfig.yourOwnModel')} hint={t('titles.titlesConfig.anyInstructGgufFromHugging')}>
          <ActionButton type="button" onClick={() => setShowCustom((current) => !current)}>
            {showCustom ? t('titles.titlesConfig.close') : t('titles.titlesConfig.add')}
          </ActionButton>
        </SettingRow>
        {showCustom && (
          <>
            <SettingRow title={t('titles.titlesConfig.repository')}>
              <TextField label={t('titles.titlesConfig.repository')} value={customRepo} onChange={setCustomRepo} placeholder="owner/model-GGUF" />
            </SettingRow>
            <SettingRow title={t('titles.titlesConfig.file')}>
              <TextField label={t('titles.titlesConfig.file')} value={customFile} onChange={setCustomFile} placeholder="model-q4_k_m.gguf" />
              <ActionButton
                type="button"
                tone="primary"
                disabled={busy || !customRepo.trim() || !customFile.trim() || !status?.supported}
                onClick={() =>
                  void run(async () => {
                    const repo = customRepo.trim()
                    const file = customFile.trim()
                    await llama.addCustomModel(repo, file)
                    const next = await llama.activateModel(`custom:${repo}/${file}`)
                    setCustomRepo('')
                    setCustomFile('')
                    setShowCustom(false)
                    return next
                  })
                }
              >
                {t('titles.titlesConfig.addAndUse')}
              </ActionButton>
            </SettingRow>
          </>
        )}
      </SettingsCard>
    </SettingsPage>
  )
}
