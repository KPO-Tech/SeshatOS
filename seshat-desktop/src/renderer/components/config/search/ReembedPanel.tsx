import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionButton, ProgressRow, SettingRow } from '../../settings/kit'
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

  let title = 'Make the vectors again'
  let hint = 'The model changed after the documents were indexed.'
  if (stale) {
    title = 'Indexed with another model'
    hint = 'Search by meaning is wrong until the vectors are made again. Search by words still works.'
  }
  if (running) {
    title = 'Making the vectors again'
    hint = `${number(status.done)} of ${number(status.total)} passages. You can close this window.`
  }
  if (status.state === 'failed') {
    title = 'Stopped before the end'
    hint = `${status.error ?? 'The embedding service refused.'} Starting again continues from there.`
  }
  if (status.state === 'cancelled') {
    title = 'Stopped'
    hint = `${number(status.done)} of ${number(status.total)} passages done.`
  }
  if (finished) {
    title = 'Vectors up to date'
    hint = `${number(status.total)} passages match ${config.model}.`
  }

  return (
    <>
      <SettingRow title={title} hint={hint}>
        {running ? (
          <ActionButton type="button" onClick={() => void stop()}>
            Stop
          </ActionButton>
        ) : !finished ? (
          <ActionButton type="button" tone="primary" disabled={starting || unsaved} onClick={() => void start()} title={unsaved ? 'Save the model first' : undefined}>
            {starting ? 'Starting...' : status.state === 'failed' || status.state === 'cancelled' ? 'Continue' : 'Re-embed'}
          </ActionButton>
        ) : null}
      </SettingRow>
      {running && <ProgressRow label="Vectors" percent={percent} />}
      {error && <div className="px-4 py-3 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
    </>
  )
}
