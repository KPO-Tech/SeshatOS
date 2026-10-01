import type { ReactNode } from 'react'
import { BrandIcon } from './catalog/BrandIcon'

type Props = {
  title: string
  description: string
  brand?: string
  // Icon override for entries with no brand mark (MCP servers).
  icon?: ReactNode
  connected: boolean
  needsAttention?: boolean
  onOpen: () => void
}

export function PluginCard({ title, description, brand, icon, connected, needsAttention, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 text-left transition-colors hover:bg-[var(--surface-muted)]"
    >
      {icon ?? <BrandIcon brand={brand} title={title} size={34} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 line-clamp-2 break-words text-[11.5px] leading-[16px] text-[var(--text-muted)]">{description}</span>
      </span>
      <span
        className={[
          'flex size-7 shrink-0 items-center justify-center rounded-lg border',
          needsAttention ? 'border-transparent text-[var(--accent-danger)]' : connected ? 'border-transparent text-[var(--accent-success)]' : 'border-[var(--border-soft)] text-[var(--text-secondary)]'
        ].join(' ')}
        title={needsAttention ? 'Needs attention' : connected ? 'Connected' : 'Connect'}
      >
        {needsAttention ? <AlertIcon /> : connected ? <CheckIcon /> : <PlusIcon />}
      </span>
    </button>
  )
}

function PlusIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
}

function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" /></svg>
}

function AlertIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
}
