import { KNOWLEDGE_NAV, type KnowledgeTab } from '../nav'

type Props = {
  active: KnowledgeTab
  isAdmin: boolean
  onSelect: (tab: KnowledgeTab) => void
}

// The inner navigation of the Knowledge platform. Pages for administrators are left out for everyone else.
export function KnowledgeNav({ active, isAdmin, onSelect }: Props) {
  return (
    <nav className="flex w-[208px] shrink-0 flex-col border-0 border-r border-solid border-[var(--border-soft)] px-3 pb-4 pt-5">
      <div className="mb-5 flex items-center gap-2.5 px-2">
        <img src="brand/knowledge-icon.svg" alt="" width={28} height={28} className="rounded-[22%]" />
        <span className="text-[14px] font-semibold text-[var(--text-primary)]">Knowledge</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {KNOWLEDGE_NAV.map((group) => {
          const items = group.items.filter((item) => isAdmin || !item.adminOnly)
          if (items.length === 0) return null
          return (
            <div key={group.title}>
              <div className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{group.title}</div>
              {items.map((item) => {
                const selected = active === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 px-2.5 py-1.5 text-left text-[13px] font-semibold transition duration-100 ${
                      selected
                        ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]'
                        : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className={selected ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'}>{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {!item.ready && <span className="rounded-full bg-[var(--surface-muted)] px-1.5 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">Soon</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <p className="m-0 rounded-lg bg-[var(--surface-muted)] px-2.5 py-2 text-[11px] leading-[16px] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">Sample data.</span> Not connected to SeshatCloud yet.
      </p>
    </nav>
  )
}
