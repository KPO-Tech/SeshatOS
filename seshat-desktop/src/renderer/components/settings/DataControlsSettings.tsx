import { useState } from 'react'
import { useUIStore } from '@renderer/stores/ui'

export function DataControlsSettings() {
  const approvalCount = useUIStore((s) => Object.keys(s.rememberedApprovals).length)
  const clearAllApprovals = useUIStore((s) => s.clearAllApprovals)
  const [justCleared, setJustCleared] = useState(false)

  function handleClearApprovals() {
    clearAllApprovals()
    setJustCleared(true)
    setTimeout(() => setJustCleared(false), 2000)
  }

  const actions = [
    {
      title: 'Clear application cache',
      description: 'Remove temporary renderer cache, preview cache, and transient local files.',
      status: 'Backend endpoint needed'
    },
    {
      title: 'Delete all conversations',
      description: 'Remove every local conversation and related messages for this account.',
      status: 'Requires bulk sessions API'
    },
    {
      title: 'Clear connector accounts',
      description: 'Disconnect all locally stored connector credentials.',
      status: 'Requires scoped bulk API'
    }
  ]

  return (
    <div>
      <header className="mb-7">
        <h1 className="text-[24px] font-semibold tracking-normal text-[var(--text-primary)]">Data Controls</h1>
        <p className="mt-2 text-[13px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
          Local data cleanup and export controls belong here. Destructive actions are prepared, but disabled until backend bulk endpoints are added.
        </p>
      </header>

      <div className="space-y-3">
        <section className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Clear remembered tool approvals</h2>
            <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
              "Always allow" decisions from permission prompts are remembered per command/file so you aren't asked again.{' '}
              {approvalCount > 0 ? `${approvalCount} remembered right now.` : 'None remembered right now.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearApprovals}
            disabled={approvalCount === 0}
            className="h-9 shrink-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-panel)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-[var(--surface-muted)]"
          >
            {justCleared ? 'Cleared' : 'Clear all'}
          </button>
        </section>

        {actions.map((action) => (
          <section key={action.title} className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{action.title}</h2>
              <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">{action.description}</p>
            </div>
            <button type="button" disabled className="h-9 shrink-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[12px] font-semibold text-[var(--text-muted)] opacity-70">
              {action.status}
            </button>
          </section>
        ))}
      </div>

      <section className="mt-5 rounded-lg border border-[var(--accent-danger)]/35 bg-[var(--surface-panel)] px-4 py-3">
        <h2 className="text-[14px] font-semibold text-[var(--accent-danger)]">Destructive data policy</h2>
        <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
          These controls should use backend endpoints with confirmation text, audit logging, and account scoping. The UI should not approximate them by deleting many records one by one.
        </p>
      </section>
    </div>
  )
}
