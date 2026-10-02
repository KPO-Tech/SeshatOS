import { useCallback, useEffect, useState } from 'react'
import { ConfigCard, Field, SoftButton, StatusPill, TextInput, ToggleSwitch } from '../knowledge/KnowledgePrimitives'
import { fetchLocalTitleConfig, formatBytes, type LocalTitleConfig } from './titlesApi'

type Progress = { phase: 'binary' | 'model'; modelId?: string; receivedBytes: number; totalBytes: number }

function errorMessage(error: unknown): string {
  const message = (error as { message?: string })?.message ?? 'Something went wrong.'
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function TitlesConfig() {
  const llama = window.nexus?.llama
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
      <ConfigCard title="Local title model" description="Names new sessions with a small model that runs on this computer." status={<StatusPill tone="muted">Desktop only</StatusPill>}>
        <div className="text-[12px] text-[var(--text-muted)]">The local title model is managed by the desktop app.</div>
      </ConfigCard>
    )
  }

  const serving = Boolean(status?.running && backend?.enabled)
  const pill = !status
    ? <StatusPill tone="muted">Loading</StatusPill>
    : !status.supported
      ? <StatusPill tone="muted">Not available on this system</StatusPill>
      : serving
        ? <StatusPill tone="ok">Running</StatusPill>
        : status.enabled
          ? <StatusPill tone="warn">{busy || !status.provisioned ? 'Installing' : 'Starting'}</StatusPill>
          : <StatusPill tone="muted">Off</StatusPill>

  return (
    <div className="grid gap-4">
      <ConfigCard
        title="Local title model"
        description="Names new sessions in parallel with the answer, using a small model on this computer. Only models that answer directly are accepted: reasoning models never return a title."
        status={pill}
      >
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-5 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
            <div>
              <div className="text-[13px] font-semibold text-[var(--text-primary)]">Generate titles locally</div>
              <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                When off, or while installing, titles come from your chat model instead.
              </div>
            </div>
            <ToggleSwitch
              enabled={Boolean(status?.enabled)}
              onChange={(enabled) => void run(() => (enabled ? llama.enable() : llama.disable()))}
            />
          </div>

          {progress && (
            <div className="grid gap-1.5">
              <div className="text-[12px] text-[var(--text-muted)]">
                {progress.phase === 'binary' ? 'Downloading llama.cpp' : 'Downloading the title model'}
                {progress.totalBytes > 0 ? ` (${Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))}%)` : ''}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <div
                  className="h-full bg-[var(--accent-primary)] transition-all"
                  style={{ width: `${progress.totalBytes > 0 ? Math.min(100, (progress.receivedBytes / progress.totalBytes) * 100) : 5}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
              {error}
            </div>
          )}

          {status && !status.provisioned && status.supported && !busy && (
            <div className="flex items-center justify-between gap-4 rounded-md border border-dashed border-[var(--border-soft)] px-3 py-2.5">
              <div className="text-[12px] text-[var(--text-muted)]">The runtime and default model install automatically on first launch.</div>
              <SoftButton type="button" tone="primary" onClick={() => void run(() => llama.provision())}>Install now</SoftButton>
            </div>
          )}
        </div>
      </ConfigCard>

      <ConfigCard title="Model" description="Smaller is faster. Models are downloaded from Hugging Face the first time you use them.">
        <div className="grid gap-2">
          {status?.models.map((model) => {
            const downloaded = status.downloadedModelIds.includes(model.id)
            const active = status.activeModelId === model.id
            return (
              <div key={model.id} className="flex items-center justify-between gap-4 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
                    <span className="truncate">{model.label}</span>
                    {active && <StatusPill tone="ok">Active</StatusPill>}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                    {[model.description, formatBytes(model.approxSizeBytes)].filter(Boolean).join(' - ')}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!active && (
                    <SoftButton type="button" tone="primary" disabled={busy || !status.supported} onClick={() => void run(() => llama.activateModel(model.id))}>
                      {downloaded ? 'Use' : 'Download and use'}
                    </SoftButton>
                  )}
                  {downloaded && !active && (
                    <SoftButton type="button" tone="danger" disabled={busy} onClick={() => void run(() => llama.deleteModel(model.id))}>Delete</SoftButton>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </ConfigCard>

      <ConfigCard title="Custom model" description="Any instruct GGUF from Hugging Face. Reasoning and thinking models are refused.">
        <div className="grid gap-3">
          <Field label="Repository">
            <TextInput value={customRepo} onChange={(event) => setCustomRepo(event.target.value)} placeholder="owner/model-GGUF" />
          </Field>
          <Field label="File">
            <TextInput value={customFile} onChange={(event) => setCustomFile(event.target.value)} placeholder="model-q4_k_m.gguf" />
          </Field>
          <div className="flex justify-end">
            <SoftButton
              type="button"
              tone="primary"
              disabled={busy || !customRepo.trim() || !customFile.trim() || !status?.supported}
              onClick={() => void run(async () => {
                const repo = customRepo.trim()
                const file = customFile.trim()
                await llama.addCustomModel(repo, file)
                const next = await llama.activateModel(`custom:${repo}/${file}`)
                setCustomRepo('')
                setCustomFile('')
                return next
              })}
            >
              Add and use
            </SoftButton>
          </div>
        </div>
      </ConfigCard>
    </div>
  )
}
