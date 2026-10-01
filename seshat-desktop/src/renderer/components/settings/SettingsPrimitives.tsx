import type { ReactNode } from 'react'

export type SettingsIconName =
  | 'sliders'
  | 'user'
  | 'keyboard'
  | 'grid'
  | 'connectors'
  | 'spark'
  | 'store'
  | 'database'
  | 'info'
  | 'help'
  | 'search'
  | 'sun'
  | 'moon'
  | 'contrast'

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-full pb-8">
      <h1 className="text-[24px] font-semibold tracking-normal text-[var(--text-primary)]">{title}</h1>
      <div className="mt-5 border-t border-[var(--border-soft)] pt-6">{children}</div>
    </div>
  )
}

export function Row({ title, description, action }: { title: string; description: string; action?: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-6">
      <div>
        <div className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="mt-1 text-[13px] text-[var(--text-muted)]">{description}</div>
      </div>
      {action && (
        <button type="button" className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
          {action}
        </button>
      )}
    </div>
  )
}

export function Avatar({ initials, size = 'sm' }: { initials: string; size?: 'sm' | 'lg' }) {
  return (
    <div className={[
      'flex shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] font-bold text-white',
      size === 'lg' ? 'size-14 text-[15px]' : 'size-8 text-[11px]'
    ].join(' ')}>
      {initials}
    </div>
  )
}

export function MetricRow({ icon, title, description, value }: { icon: SettingsIconName; title: string; description: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 text-[var(--text-secondary)]">
          <SettingsIcon name={icon} />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</div>
          <div className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">{description}</div>
        </div>
      </div>
      <div className="shrink-0 text-[14px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}

export function AccountLine({ title, value, action, onAction }: { title: string; value: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex min-h-[42px] items-center justify-between gap-8">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="mt-0.5 truncate text-[13px] text-[var(--text-muted)]">{value}</div>
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
        >
          {action}
        </button>
      )}
    </div>
  )
}

export function ToggleRow({ title, description, enabled = false, onChange }: { title: string; description: string; enabled?: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-8">
      <div>
        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</div>
        <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={[
          'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
          enabled ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--surface-muted)]'
        ].join(' ')}
        aria-pressed={enabled}
      >
        <span className="size-4 rounded-full bg-white" />
      </button>
    </div>
  )
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-8 text-center text-[13px] font-semibold text-[var(--text-muted)]">
      {label}
    </div>
  )
}

export function AboutLine({ title, value, tone = 'default', muted = false }: { title: string; value: string; tone?: 'default' | 'success' | 'muted'; muted?: boolean }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-8">
      <div className="text-[13px] font-semibold text-[var(--text-secondary)]">{title}</div>
      <div
        className={[
          'max-w-[520px] truncate text-right text-[13px] font-semibold',
          tone === 'success' ? 'text-[var(--accent-success)]' : '',
          tone === 'muted' || muted ? 'text-[var(--text-muted)]' : '',
          tone === 'default' && !muted ? 'text-[var(--text-primary)]' : ''
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  )
}

export function SectionDivider() {
  return <div className="border-t border-[var(--border-soft)]" />
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function formatStatus(status: string) {
  if (!status) return 'Unknown'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function SettingsIcon({ name }: { name: SettingsIconName }) {
  const paths: Record<SettingsIconName, ReactNode> = {
    sliders: <path d="M4 7h12M4 13h12M7 5.5v3M13 11.5v3" />,
    user: <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 14a5.5 5.5 0 0 1 11 0" />,
    keyboard: <path d="M2.5 4.5h11v7h-11ZM4.5 6.5h.01M6.8 6.5h.01M9.1 6.5h.01M11.4 6.5h.01M4.5 9.4h7" />,
    grid: <path d="M3 3h4v4H3ZM9 3h4v4H9ZM3 9h4v4H3ZM9 9h4v4H9Z" />,
    connectors: <path d="M5 4v8M11 4v8M3.5 6h3M9.5 10h3M5 12h6" />,
    spark: <path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M3 3l2.8 2.8M10.2 10.2 13 13M13 3l-2.8 2.8M5.8 10.2 3 13" />,
    store: <path d="M2.5 7h11M4 7l1-4h6l1 4M4 7v6h8V7M6.5 13v-3h3v3" />,
    database: <path d="M3 4c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2ZM3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />,
    info: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 7.5V11M8 5h.01" />,
    help: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM6.5 6a1.7 1.7 0 1 1 2.5 1.5c-.7.4-1 .8-1 1.5M8 11h.01" />,
    search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
    sun: <path d="M8 4.5v-2M8 13.5v-2M4.5 8h-2M13.5 8h-2M5.2 5.2 3.8 3.8M12.2 12.2l-1.4-1.4M10.8 5.2l1.4-1.4M3.8 12.2l1.4-1.4M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
    moon: <path d="M12.5 10.2A5 5 0 0 1 5.8 3.5 5.5 5.5 0 1 0 12.5 10.2Z" />,
    contrast: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM8 2v12" />
  }

  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}

export function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 13.5H4.5A1.5 1.5 0 0 1 3 12V6a1.5 1.5 0 0 1 1.5-1.5H7" />
      <path d="M11 5.5 14.5 9 11 12.5" />
      <path d="M14 9H7" />
    </svg>
  )
}
