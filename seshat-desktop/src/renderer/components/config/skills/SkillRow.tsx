import type { ReactNode } from 'react'

export function SkillRow({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
        {subtitle && <div className="line-clamp-2 break-words text-[11.5px] leading-4 text-[var(--text-muted)]">{subtitle}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}
