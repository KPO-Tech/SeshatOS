import { useEffect, useState } from 'react'
import type { InstallPlan } from './skillsTypes'

type Props = {
  name: string
  plan: InstallPlan
  /** Makes the environment; rejects with the reason it could not be made. */
  onConfirm: () => Promise<void>
  /** The person leaves without installing: the repository that was read is removed. */
  onCancel: () => void
}

const SHOWN = 14

function PackageList({ packages }: { packages: string[] }) {
  const shown = packages.slice(0, SHOWN)
  return (
    <p className="m-0 mt-1.5 text-[12px] leading-5 text-[var(--text-secondary)]">
      {shown.join(', ')}
      {packages.length > SHOWN ? ` and ${packages.length - SHOWN} more` : ''}
    </p>
  )
}

function Block({ title, status, ok, children }: { title: string; status: string; ok: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">{title}</h3>
        <span className={`text-[11.5px] font-medium ${ok ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'}`}>{status}</span>
      </div>
      {children}
    </section>
  )
}

/**
 * What an installation will put on the machine, shown before anything is installed. The skills work only with their packages, and the
 * packages come from the internet: the person sees what, and where, and agrees.
 */
export function SkillInstallDialog({ name, plan, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = (plan.python?.found ?? true) && (plan.node?.found ?? true)

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && !busy && onCancel()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [busy, onCancel])

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The installation failed.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-label={`Install ${name}`} className="flex max-h-[85vh] w-full max-w-[520px] flex-col rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]">
        <h2 className="m-0 text-[16px] font-semibold text-[var(--text-primary)]">Install {name}</h2>
        <p className="m-0 mt-1.5 text-[12.5px] leading-5 text-[var(--text-muted)]">
          These skills need packages to work. They are installed in a private environment made for {name} only, downloaded from the official package sources, and removed with it when you uninstall.
        </p>

        <div className="no-scrollbar mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {plan.python && (
            <Block title={`Python ${plan.python.minimum}+, ${plan.python.packages.length} packages`} status={plan.python.found ? `Found ${plan.python.version ?? ''}` : 'Not found'} ok={plan.python.found}>
              <PackageList packages={plan.python.packages} />
            </Block>
          )}
          {plan.node && (
            <Block title={`Node.js, ${plan.node.packages.length} packages`} status={plan.node.found ? `Found ${plan.node.version ?? ''}` : 'Not found'} ok={plan.node.found}>
              <PackageList packages={plan.node.packages} />
              <p className="m-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">Install scripts of the packages are not run.</p>
            </Block>
          )}
          {plan.warnings?.map((warning) => (
            <p key={warning} className="m-0 rounded-lg border border-[var(--accent-warning,var(--border-strong))] px-3 py-2 text-[12px] leading-5 text-[var(--text-secondary)]">
              {warning}
            </p>
          ))}
          {error && <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-root)] p-3 font-mono text-[11px] leading-4 text-[var(--accent-danger)]">{error}</pre>}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-[var(--text-muted)]">{busy ? 'Installing. This can take a few minutes...' : ''}</span>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onCancel} className="h-9 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-4 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50">
              Cancel
            </button>
            <button type="button" disabled={busy || !ready} onClick={() => void confirm()} className="h-9 cursor-pointer rounded-lg border-0 bg-[var(--accent-primary)] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-default disabled:opacity-50">
              {error ? 'Try again' : 'Install'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
