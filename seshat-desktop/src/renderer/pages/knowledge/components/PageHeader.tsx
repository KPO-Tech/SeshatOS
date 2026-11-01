import type { ReactNode } from 'react'

/** The head of a Knowledge page: an icon on a tinted tile, the title with one line under it, and the buttons of the page on the right. */
export function PageHeader({ icon, title, text, actions }: { icon: ReactNode; title: string; text: string; actions?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">{icon}</span>
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-[var(--text-primary)]">{title}</h1>
          <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)]">{text}</p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export const HEADER_BUTTON = 'flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold'
export const SECONDARY_BUTTON = `${HEADER_BUTTON} border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-60`
export const PRIMARY_BUTTON = `${HEADER_BUTTON} border-0 bg-[var(--accent-primary)] text-white hover:opacity-90`
