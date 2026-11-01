import { useCallback, useEffect, useState } from 'react'
import { ActionButton, Notice, ProgressRow, SettingRow, SettingsCard, SettingsPage, StatusBadge, TextField, Toggle, type Tone } from '../../settings/kit'
import { fetchLocalTitleConfig, formatBytes, type LocalTitleConfig } from './titlesApi'

type Progress = { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }

function errorMessage(error: unknown): string {
  const message = (error as { message?: string })?.message ?? 'Something went wrong.'
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function TitlesConfig() {
  const llama = window.seshat?.llama
  const [status, setStatus] = useState<LlamaStatus | null>(null)
  const [backend, setBackend] = useState<LocalTitleConfig | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customRepo, setCustomRepo] = useState('')
  const [customFile, setCustomFile] = useState('')

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
      <SettingsPage id="titles" badge={<StatusBadge tone="muted">Desktop only</StatusBadge>}>
        {null}
      </SettingsPage>
    )
  }

  const serving = Boolean(status?.running && backend?.enabled)
  const state: { tone: Tone; label: string } = !status
    ? { tone: 'muted', label: 'Loading' }
    : !status.supported
      ? { tone: 'muted', label: 'Not available' }
      : serving
        ? { tone: 'ok', label: 'Running' }
        : status.enabled
          ? { tone: 'warn', label: busy || !status.provisioned ? 'Installing' : 'Starting' }
          : { tone: 'muted', label: 'Off' }
  const percent = progress && progress.totalBytes > 0 ? Math.min(100, (progress.receivedBytes / progress.totalBytes) * 100) : 5

  return (
    <SettingsPage id="titles" badge={<StatusBadge tone={state.tone}>{state.label}</StatusBadge>}>
      {error && <Notice tone="error">{error}</Notice>}

      <SettingsCard>
        <SettingRow title="Name chats on this computer" hint="Off: titles come from your chat model.">
          <Toggle label="Name chats on this computer" enabled={Boolean(status?.enabled)} onChange={(enabled) => void run(() => (enabled ? llama.enable() : llama.disable()))} />
        </SettingRow>
        {progress && <ProgressRow label={progress.phase === 'binary' ? 'Downloading llama.cpp' : 'Downloading the title model'} percent={percent} />}
        {status && !status.provisioned && status.supported && !busy && (
          <SettingRow title="Runtime and model">
            <ActionButton type="button" tone="primary" onClick={() => void run(() => llama.provision())}>
              Install now
            </ActionButton>
          </SettingRow>
        )}
      </SettingsCard>

      <SettingsCard title="Model">
        {status?.models.map((model) => {
          const downloaded = status.downloadedModelIds.includes(model.id)
          const active = status.activeModelId === model.id
          return (
            <SettingRow key={model.id} title={model.label} hint={[model.description, formatBytes(model.approxSizeBytes)].filter(Boolean).join(' - ')}>
              {active && <StatusBadge tone="ok">Active</StatusBadge>}
              {!active && (
                <ActionButton type="button" tone="primary" disabled={busy || !status.supported} onClick={() => void run(() => llama.activateModel(model.id))}>
                  {downloaded ? 'Use' : 'Download'}
                </ActionButton>
              )}
              {downloaded && !active && (
                <ActionButton type="button" tone="danger" disabled={busy} onClick={() => void run(() => llama.deleteModel(model.id))}>
                  Delete
                </ActionButton>
              )}
            </SettingRow>
          )
        })}
      </SettingsCard>

      <SettingsCard title="Custom model">
        <SettingRow title="Repository">
          <TextField label="Repository" value={customRepo} onChange={setCustomRepo} placeholder="owner/model-GGUF" />
        </SettingRow>
        <SettingRow title="File">
          <TextField label="File" value={customFile} onChange={setCustomFile} placeholder="model-q4_k_m.gguf" />
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
                return next
              })
            }
          >
            Add
          </ActionButton>
        </SettingRow>
      </SettingsCard>
    </SettingsPage>
  )
}
