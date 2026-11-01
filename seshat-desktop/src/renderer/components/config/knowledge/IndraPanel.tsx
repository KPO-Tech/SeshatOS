import { useCallback, useEffect, useState } from 'react'
import { ActionButton, SettingRow, SettingsCard, StatusBadge, Toggle } from '../../settings/kit'
import { fetchIndraStatus, installIndra, removeIndra, setIndraEnabled } from './knowledgeApi'
import { INDRA_LICENSE_POINTS, indraPhase, indraPill, indraSizeText, indraStepText } from './indraView'
import type { IndraStatusResult } from './knowledgeTypes'

const POLL_MS = 1500

// An optional reader for scanned pages (Datalab's Indra OCR). It is installed on request in a Python environment of its own, after the
// licence of its weights has been accepted, and it reads on this computer only. When it is on it reads a scanned page first, and the
// built-in OCR reads what it leaves empty.
export function IndraPanel() {
  const [result, setResult] = useState<IndraStatusResult | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setResult(await fetchIndraStatus())
    } catch {
      // Advisory: the rest of the document reader settings stay usable if this probe fails.
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const installing = result?.install.status === 'running'
  useEffect(() => {
    if (!installing) return
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [installing, refresh])

  if (!result) return null
  const { indra, install } = result
  const phase = indraPhase(indra, install)
  const pill = indraPill(phase)
  const canAsk = phase === 'available' || phase === 'failed' || phase === 'relicense'

  async function act(run: () => Promise<IndraStatusResult>) {
    setBusy(true)
    setError(null)
    try {
      setResult(await run())
    } catch (failure) {
      setError((failure as { message?: string })?.message ?? 'The request failed.')
    } finally {
      setBusy(false)
    }
  }

  const action = (phase === 'on' || phase === 'off') && <Toggle label="Indra OCR" enabled={phase === 'on'} onChange={(enabled) => void act(() => setIndraEnabled(enabled))} />

  return (
    <SettingsCard title="Indra OCR" badge={<StatusBadge tone={pill.tone === 'ok' ? 'ok' : pill.tone === 'warn' ? 'warn' : 'muted'}>{pill.label}</StatusBadge>} action={action || undefined}>
      {phase === 'no-python' && (
        <SettingRow title="Python 3.10 or newer is needed">
          <ActionButton type="button" onClick={() => void refresh()}>
            Check again
          </ActionButton>
        </SettingRow>
      )}

      {canAsk && (
        <>
          {phase === 'relicense' && <div className="px-4 py-3 text-[12px] font-semibold text-[var(--accent-primary)]">The licence changed. Accept it again to keep using Indra.</div>}
          <div className="px-4 py-3">
            <ul className="m-0 list-disc pl-4 text-[12px] leading-[18px] text-[var(--text-muted)]">
              {INDRA_LICENSE_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <a href={indra.license_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] font-semibold text-[var(--accent-primary)] hover:underline">
              Read the licence
            </a>
          </div>
          <SettingRow title="I accept the licence of the weights">
            <input type="checkbox" aria-label="I accept the licence of the weights" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          </SettingRow>
          <SettingRow title={indraSizeText(indra)}>
            <ActionButton type="button" tone="primary" disabled={!accepted || busy} onClick={() => void act(() => installIndra(indra.license_version))}>
              {phase === 'relicense' ? 'Accept' : 'Install'}
            </ActionButton>
          </SettingRow>
        </>
      )}

      {phase === 'failed' && install.error && <div className="break-words px-4 py-3 text-[12px] font-semibold text-[var(--accent-danger)]">Installation failed: {install.error}</div>}

      {phase === 'installing' && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--text-muted)]">
            <span className="truncate">{indraStepText(install)}</span>
            <span>A few minutes</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
            <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width]" style={{ width: `${Math.round((((install.step_index ?? 1) - 0.5) / (install.step_count || 4)) * 100)}%` }} />
          </div>
        </div>
      )}

      {(phase === 'on' || phase === 'off') && (
        <SettingRow title={`Version ${indra.version}`}>
          <a href={indra.license_url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-[var(--accent-primary)] hover:underline">
            Licence
          </a>
          {confirmRemove ? (
            <>
              <ActionButton type="button" tone="danger" disabled={busy} onClick={() => void act(removeIndra).then(() => setConfirmRemove(false))}>
                Delete
              </ActionButton>
              <ActionButton type="button" disabled={busy} onClick={() => setConfirmRemove(false)}>
                Keep
              </ActionButton>
            </>
          ) : (
            <ActionButton type="button" disabled={busy} onClick={() => setConfirmRemove(true)}>
              Remove
            </ActionButton>
          )}
        </SettingRow>
      )}

      {error && <div className="px-4 py-3 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
    </SettingsCard>
  )
}
