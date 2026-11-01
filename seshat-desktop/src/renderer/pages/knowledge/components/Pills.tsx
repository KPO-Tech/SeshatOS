import type { ReactNode } from 'react'

export type PillItem = { id: string; label: string; count?: number; icon?: ReactNode }

function Count({ value, active }: { value: number; active: boolean }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${active ? 'bg-white/25 text-white' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{value}</span>
}

/** The choices of a filter as pills, the one picked in the accent colour, each with the number of things it holds. */
export function Pills({ label, items, value, onChange }: { label: string; items: PillItem[]; value: string | ReadonlySet<string>; onChange: (id: string) => void }) {
  const picked = (id: string) => (typeof value === 'string' ? value === id : value.has(id))
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={picked(item.id)}
          onClick={() => onChange(item.id)}
          className={`flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-medium ${picked(item.id) ? 'border-transparent bg-[var(--accent-primary)] text-white' : 'border-[var(--border-soft)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'}`}
        >
          {item.icon}
          <span className="max-w-[200px] truncate">{item.label}</span>
          {item.count !== undefined && <Count value={item.count} active={picked(item.id)} />}
        </button>
      ))}
    </div>
  )
}

/** The search field of a list page: a magnifier and the text, at the width of the page. */
export function ListSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative shrink-0">
      <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-[var(--text-muted)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m16 16 4 4" />
        </svg>
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] pl-10 pr-3 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
      />
    </div>
  )
}
