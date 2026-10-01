import type { ReactNode } from 'react'
import { isHealthy, type PluginAccount } from '../pluginsTypes'

type Props = {
  accounts: PluginAccount[]
  busyId: string | null
  onDisconnect: (account: PluginAccount) => void
  // Optional extra per-account action (e.g. "Sync now").
  extraAction?: (account: PluginAccount) => ReactNode
}

export function AccountRows({ accounts, busyId, onDisconnect, extraAction }: Props) {
  if (accounts.length === 0) return null
  return (
    <div className="grid gap-2">
      {accounts.map((account) => (
        <div key={account.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{account.label}</div>
            <div className={['mt-0.5 flex items-center gap-1.5 text-[11px]', isHealthy(account) ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'].join(' ')}>
              <span className="size-1.5 rounded-full bg-current" />
              <span className="truncate">{isHealthy(account) ? 'Connected' : account.lastError || 'Needs attention'}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {extraAction?.(account)}
            <button
              type="button"
              disabled={busyId === account.id}
              onClick={() => onDisconnect(account)}
              className="h-7 rounded-md border border-[var(--border-soft)] px-2.5 text-[11.5px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              {busyId === account.id ? 'Removing...' : 'Disconnect'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function PrimaryAction({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-8 rounded-lg bg-[var(--accent-primary)] px-3.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{message}</p>
}
