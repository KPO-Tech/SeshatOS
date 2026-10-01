import type { ReactNode } from 'react'

// Every Admin table shares this shell (rounded card, header row styling,
// hover on data rows) - only the columns and row content differ per view.
export function AdminTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--border-soft)]">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-muted)]">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function AdminTh({ children, align }: { children?: ReactNode; align?: 'right' }) {
  return (
    <th className={`px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

export function AdminTr({ children }: { children: ReactNode }) {
  return <tr className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--surface-hover)]">{children}</tr>
}

export function AdminTd({ children, muted, mono, align }: { children?: ReactNode; muted?: boolean; mono?: boolean; align?: 'right' }) {
  return (
    <td
      className={[
        'px-3.5 py-2.5 align-middle',
        muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]',
        mono ? 'font-mono text-[12px]' : '',
        align === 'right' ? 'text-right' : '',
      ].join(' ')}
    >
      {children}
    </td>
  )
}

export function AdminEmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3.5 py-8 text-center text-[13px] text-[var(--text-muted)]">
        {children}
      </td>
    </tr>
  )
}

const BADGE_TONE = {
  success: 'bg-[var(--accent-success)]/15 text-[var(--accent-success)]',
  warning: 'bg-[var(--accent-warning)]/15 text-[var(--accent-warning)]',
  danger: 'bg-[var(--accent-danger)]/15 text-[var(--accent-danger)]',
  neutral: 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
} as const

export function AdminStatusBadge({ tone, children }: { tone: keyof typeof BADGE_TONE; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${BADGE_TONE[tone]}`}>
      {children}
    </span>
  )
}

export function AdminIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-40"
    >
      {children}
    </button>
  )
}
