import type { ReactNode } from 'react'

export type TabItem<Id extends string> = {
  id: Id
  /** Already translated. */
  label: string
  icon?: ReactNode
  /** A small number after the label (how many sessions). */
  count?: number
  /** Greyed, and cannot be opened. */
  disabled?: boolean
  /** The hint over a tab that cannot be opened. */
  title?: string
}

type Props<Id extends string> = {
  tabs: ReadonlyArray<TabItem<Id>>
  value: Id
  onChange: (id: Id) => void
  ariaLabel: string
  className?: string
}

/** The tabs of a page (Overview, Files...): a line under the header, the open one underlined in the accent colour. */
export function TabBar<Id extends string>({ tabs, value, onChange, ariaLabel, className = '' }: Props<Id>) {
  return (
    <nav className={`flex shrink-0 gap-1 border-b border-[var(--border-soft)] px-6 ${className}`} role="tablist" aria-label={ariaLabel}>
      {tabs.map((item) => {
        const selected = value === item.id
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={item.disabled}
            title={item.disabled ? item.title : undefined}
            onClick={() => onChange(item.id)}
            className={`-mb-px flex items-center gap-1.5 border-0 border-b-2 bg-transparent px-3 py-2 text-[13px] font-medium ${item.disabled ? 'cursor-not-allowed border-transparent text-[var(--text-muted)] opacity-40' : selected ? 'cursor-pointer border-[var(--accent-primary)] text-[var(--accent-primary)]' : 'cursor-pointer border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && item.count > 0 && <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10.5px] leading-none text-[var(--text-muted)]">{item.count}</span>}
          </button>
        )
      })}
    </nav>
  )
}
