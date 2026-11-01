import type { ReactNode } from 'react'

type CardProps = {
  title?: string
  icon?: ReactNode
  badge?: ReactNode
  action?: ReactNode
  /** Free content instead of divided rows. */
  padded?: boolean
  children: ReactNode
}

/** A card answers one question: its title is the question, its rows are the answer. */
export function SettingsCard({ title, icon, badge, action, padded = false, children }: CardProps) {
  return (
    <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      {title && (
        <div className="flex min-h-12 items-center justify-between gap-4 border-b border-[var(--border-soft)] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="flex shrink-0 text-[var(--text-secondary)]">{icon}</span>}
            <h2 className="m-0 truncate text-[14px] font-semibold text-[var(--text-primary)]">{title}</h2>
            {badge}
          </div>
          {action}
        </div>
      )}
      <div className={padded ? 'p-4' : 'divide-y divide-[var(--border-soft)]'}>{children}</div>
    </section>
  )
}

type RowProps = {
  title: string
  /** Only when it prevents a mistake. */
  hint?: string
  icon?: ReactNode
  children?: ReactNode
}

/** One setting: its name on the left, its control on the right. */
export function SettingRow({ title, hint, icon, children }: RowProps) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-6 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="flex shrink-0 text-[var(--text-secondary)]">{icon}</span>}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
          {hint && <div className="mt-0.5 break-words text-[12px] text-[var(--text-muted)]">{hint}</div>}
        </div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}
