import type { ReactNode } from 'react'
import { AdminStatusBadge } from './AdminTable'

// Providers and Connectors both show "a fixed catalog of known kinds, each
// either configured or not" as a card grid rather than an open-ended table
// (there's no "create a new kind" concept for either).
export function AdminCardGrid({ children }: { children: ReactNode }) {
  return <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-2 xl:grid-cols-3">{children}</div>
}

export function AdminCard({
  icon,
  title,
  subtitle,
  configured,
  actions,
}: {
  icon: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  configured: boolean
  actions: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3.5">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
          {subtitle && <div className="truncate text-[11px] text-[var(--text-muted)]">{subtitle}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <AdminStatusBadge tone={configured ? 'success' : 'neutral'}>{configured ? 'Configured' : 'Not configured'}</AdminStatusBadge>
        {actions}
      </div>
    </div>
  )
}
