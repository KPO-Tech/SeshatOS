import { useCallback, useEffect, useRef, useState } from 'react'
import { SoftButton } from '@renderer/components/config/knowledge/KnowledgePrimitives'
import { getReembedStatus, startReembed, stopReembed } from '@renderer/components/config/knowledge/knowledgeApi'
import type { EmbedderConfig, ReembedStatus } from '@renderer/components/config/knowledge/knowledgeTypes'

const number = (value: number) => value.toLocaleString('en-US')

// Making the vectors of the collections again with the model now in use. The documents are not read or cut again: only the vectors change,
// so it takes minutes, and it can be stopped and started again without losing what was done.
export function ReembedPanel({ config, unsaved, onDone }: { config: EmbedderConfig | null; unsaved: boolean; onDone: () => void }) {
  const [status, setStatus] = useState<ReembedStatus>({ state: 'idle', done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const wasRunning = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const next = await getReembedStatus()
      setStatus(next)
      // The configuration says whether the vectors are up to date once a re-embedding has finished.
      if (wasRunning.current && next.state !== 'running') onDone()
      wasRunning.current = next.state === 'running'
    } catch {
      // The status is only a convenience: the panel stays as it was.
    }
  }, [onDone])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (status.state !== 'running') return
    const timer = window.setInterval(() => void refresh(), 1500)
    return () => window.clearInterval(timer)
  }, [status.state, refresh])

  async function start() {
    setStarting(true)
    setError(null)
    try {
      wasRunning.current = true
      setStatus(await startReembed())
    } catch (err) {
      wasRunning.current = false
      setError((err as { message?: string })?.message ?? 'The vectors could not be made again.')
    } finally {
      setStarting(false)
    }
  }

  async function stop() {
    try {
      setStatus(await stopReembed())
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'It could not be stopped.')
    }
  }

  if (!config?.is_configured) return null
  const running = status.state === 'running'
  const stale = Boolean(config.vectors_stale)
  const unknown = Boolean(config.vectors_unknown) && !stale
  const finished = status.state === 'done' && !stale
  // Nothing to say when the vectors are up to date and nothing was just done.
  if (!running && !stale && !unknown && !finished && status.state !== 'failed' && status.state !== 'cancelled') return null

  const percent = status.total > 0 ? Math.min(100, Math.round((status.done / status.total) * 100)) : 0
  const tone = stale || status.state === 'failed' ? 'warn' : finished ? 'ok' : 'neutral'

  let title = 'Make the vectors again'
  let text = 'If the model was changed after the documents were indexed, their vectors no longer match it. This makes them again from the text already stored: the documents are not read again.'
  if (stale) {
    title = 'The documents were indexed with another model'
    text = 'Their vectors do not match the model in use, so the search by meaning finds the wrong passages (the search by words still works). Make them again from the text already stored: the documents are not read or cut again.'
  }
  if (running) {
    title = 'Making the vectors again'
    text = `${number(status.done)} of ${number(status.total)} passages. You can close this window: it goes on.`
  }
  if (status.state === 'failed') {
    title = 'It stopped before the end'
    text = `${status.error ?? 'The embedding service refused.'} What was done is kept: starting again continues from there.`
  }
  if (status.state === 'cancelled') {
    title = 'Stopped'
    text = `${number(status.done)} of ${number(status.total)} passages were done. Starting again continues from there.`
  }
  if (finished) {
    title = 'The vectors are up to date'
    text = `${number(status.total)} passages now match ${config.model}.`
  }

  const border = tone === 'warn' ? 'border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/8' : tone === 'ok' ? 'border-[var(--accent-success)]/30 bg-[var(--accent-success)]/8' : 'border-[var(--border-soft)] bg-[var(--surface-muted)]'

  return (
    <div className={`grid gap-3 rounded-lg border px-3.5 py-3 ${border}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-[var(--text-primary)]">{title}</div>
          <p className="m-0 mt-0.5 text-[12px] leading-[18px] text-[var(--text-muted)]">{text}</p>
        </div>
        {running ? (
          <SoftButton type="button" onClick={() => void stop()}>
            Stop
          </SoftButton>
        ) : !finished ? (
          <SoftButton type="button" tone="primary" disabled={starting || unsaved} onClick={() => void start()} title={unsaved ? 'Save the model first' : undefined}>
            {starting ? 'Starting...' : status.state === 'failed' || status.state === 'cancelled' ? 'Continue' : 'Re-embed'}
          </SoftButton>
        ) : null}
      </div>
      {running && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      )}
      {error && <div className="text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
    </div>
  )
}
