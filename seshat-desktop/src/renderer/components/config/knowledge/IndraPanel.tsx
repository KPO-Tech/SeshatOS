import { useCallback, useEffect, useState } from 'react'
import { SoftButton, StatusPill, ToggleSwitch } from './KnowledgePrimitives'
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

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-[var(--text-primary)]">Indra OCR (optional)</div>
          <div className="mt-0.5 text-[11px] leading-[15px] text-[var(--text-muted)]">
            A fast reader of scanned pages from Datalab, for many alphabets. It runs on this computer only. When it is on it reads a scanned page first, and the built-in OCR reads what it leaves empty.
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
          {(phase === 'on' || phase === 'off') && <ToggleSwitch enabled={phase === 'on'} onChange={(enabled) => void act(() => setIndraEnabled(enabled))} />}
        </div>
      </div>

      <div className="grid gap-3 px-3 py-3">
        {phase === 'no-python' && (
          <>
            <p className="m-0 text-[12px] leading-[17px] text-[var(--text-muted)]">
              Indra is a Python program, and Python 3.10 or newer was not found on this computer. Install Python, then check again.
            </p>
            <div>
              <SoftButton type="button" onClick={() => void refresh()}>
                Check again
              </SoftButton>
            </div>
          </>
        )}

        {canAsk && (
          <>
            {phase === 'relicense' && (
              <p className="m-0 text-[12px] font-semibold leading-[17px] text-[var(--accent-primary)]">
                The licence changed since you accepted it. Read it and accept it again to keep using Indra.
              </p>
            )}
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5">
              <div className="text-[12px] font-semibold text-[var(--text-primary)]">Before you install: the licence of the weights</div>
              <ul className="m-0 mt-1.5 list-disc pl-4 text-[11.5px] leading-[17px] text-[var(--text-muted)]">
                {INDRA_LICENSE_POINTS.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <a href={indra.license_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11.5px] font-semibold text-[var(--accent-primary)] hover:underline">
                Read the full licence
              </a>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-[17px] text-[var(--text-primary)]">
              <input type="checkbox" className="mt-[3px]" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>I have read the licence, and I (or my organization) may use the weights under it.</span>
            </label>
            <div className="flex items-center gap-3">
              <SoftButton type="button" tone="primary" disabled={!accepted || busy} onClick={() => void act(() => installIndra(indra.license_version))}>
                {phase === 'relicense' ? 'Accept and keep using' : 'Install Indra OCR'}
              </SoftButton>
              <span className="text-[11px] text-[var(--text-faint)]">{indraSizeText(indra)}</span>
            </div>
          </>
        )}

        {phase === 'failed' && install.error && (
          <p className="m-0 break-words text-[11px] font-semibold leading-[16px] text-[var(--accent-primary)]">The installation failed: {install.error}</p>
        )}

        {phase === 'installing' && (
          <div>
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[var(--text-muted)]">
              <span className="truncate">{indraStepText(install)}</span>
              <span>This can take a few minutes</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-soft)]">
              <div
                className="h-full rounded-full bg-[var(--accent-primary)] transition-[width]"
                style={{ width: `${Math.round((((install.step_index ?? 1) - 0.5) / (install.step_count || 4)) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {(phase === 'on' || phase === 'off') && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11.5px] leading-[16px] text-[var(--text-muted)]">
              Version {indra.version}. {phase === 'on' ? 'Reading scanned pages first.' : 'Installed, not reading.'}
            </span>
            <a href={indra.license_url} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-[var(--accent-primary)] hover:underline">
              Licence
            </a>
            <span className="ml-auto">
              {confirmRemove ? (
                <span className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Delete it and its model?</span>
                  <SoftButton type="button" tone="danger" disabled={busy} onClick={() => void act(removeIndra).then(() => setConfirmRemove(false))}>
                    Remove
                  </SoftButton>
                  <SoftButton type="button" disabled={busy} onClick={() => setConfirmRemove(false)}>
                    Keep
                  </SoftButton>
                </span>
              ) : (
                <SoftButton type="button" disabled={busy} onClick={() => setConfirmRemove(true)}>
                  Remove
                </SoftButton>
              )}
            </span>
          </div>
        )}

        {error && <p className="m-0 text-[11px] font-semibold text-[var(--accent-primary)]">{error}</p>}
      </div>
    </div>
  )
}
